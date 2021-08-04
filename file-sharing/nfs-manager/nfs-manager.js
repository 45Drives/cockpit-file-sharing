/* 
    Cockpit File Sharing - Cockpit plugin for managing file shares.
    Copyright (C) 2021 Sam Silver <ssilver@45drives.com>
    
    This file is part of Cockpit File Sharing.
    Cockpit File Sharing is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Cockpit File Sharing is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.  
*/

// Import components
import {fatalError, Notification} from "../components/notifications.js"
import {showModal, hideModal} from "../components/modals.js"
import {NfsExport, newExportEntry, createNfs} from "./components/exports.js"
import {populateExportList, displayExports} from "./components/list.js"

let exportsList = []

// Start NFS Manager
main();
function main() {
    check_permissions()
}

// Checks if user is root. If not, give a fatal error, if yes, call check_sudo.
function check_permissions() {
    let root_check = cockpit.permission({ admin: true });
	root_check.addEventListener(
		"changed", 
		function() {
			if(root_check.allowed){
                check_sudo();
			}else{
				fatalError("You do not have administrator access.");
			}
	 	}
	)
}

// Checks if user can use sudo. If not, give a fatal error, if yes, call check_nfs.
function check_sudo() {
    let sudoTimeout = false
    setTimeout(() => {
        sudoTimeout = true
    }, 1000)
    var proc = cockpit.spawn(["sudo", "-v"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        if (sudoTimeout) {
            fatalError("Could not use sudo. Is the machine name in /etc/hosts?")
        }
        else {check_nfs();}
    });
}

// Tries running `showmount -e` to check if nfs is installed, if successful, calls setup(), if unsuccessful,
// shows error message and disables buttons
function check_nfs() {
    var proc = cockpit.spawn(["systemctl", "status", "nfs-server"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        setup()
    });
    proc.fail(function () {
        fatalError("Failed to load NFS services. Is NFS installed or enabled?")
    });

}

// Awaits populating the list of current NFS(s). Once finished setup buttons and clear branding
async function setup() {
    await refreshList();
    set_up_buttons();
    hideModal("blurred-screen");
}

// Initiallizes html buttons with functions
function set_up_buttons() {
    document.getElementById("show-nfs-modal").addEventListener("click", () => { showModal("nfs-modal", nfsModal) } );
    document.getElementById("hide-nfs-modal").addEventListener("click", () => { hideModal("nfs-modal", clearNfsModal) } );
    document.getElementById("cancel-rm-client").addEventListener("click", () => { hideModal("rm-client-modal") } );
}

// Show "add a export" modal, this also clears all pervious inputs and adds first client as soon as function opens
function nfsModal() {
    // Create new NFSExport
    let newExport = new NfsExport()
    newExport.addClient(true)

    // Add notifaction
    let modalNotification = new Notification("nfs-modal")
    let mainNotification = new Notification("nfs")
 
    // Add new event listeners to button for new export object 
    document.getElementById("add-nfs-btn").addEventListener("click", async () => {
        try {
            // Retrive the structured entry and add to list
            let listEntry = await newExportEntry(newExport, exportsList)
            exportsList.push(listEntry);

            // Add new entry to export file
            let msg = Promise.resolve(createNfs(listEntry))
            msg.then(value => {
                mainNotification.setSuccess(value);
            }) 

            // Refresh export list, hide modal and clear modals info
            displayExports(exportsList)
            hideModal("nfs-modal")
            clearNfsModal()
        }
        catch (err) {
            // Display error when it occurs
            modalNotification.setError(err)
        }
    });
    // When + button is clicked in modal add a client object to export
    document.getElementById("add-client-btn").addEventListener("click", () => {
        newExport.addClient(true);
    });
}

// Clear NFS modals contents
function clearNfsModal() {
    // Remove pervious event listeners from buttons
    let addNfs = document.getElementById("add-nfs-btn")
    addNfs.replaceWith(addNfs.cloneNode(true));

    let addClient = document.getElementById("add-client-btn")
    addClient.replaceWith(addClient.cloneNode(true));

    // Finds all input tags and clears them
    var inputs = document.getElementsByTagName("input");
    for (var item in inputs) {
        if(inputs[item].type == "text") {
            inputs[item].value = "";
        }
    }

    // Clears out all old clients, and adds one new client, without spacer.
    document.getElementById("clients").innerHTML = "";

    // Clear Notifications
    let modalNotification = new Notification("nfs-modal");
    modalNotification.clearInfo();

    // Clear path check
    document.getElementById("is-clicked").value = "";
}

// Reset the main page list
export async function refreshList() {
    try {
        // Reset the exports list
        exportsList = await populateExportList();
    }
    catch (err) {
        fatalError(err)
    }
    // Display the list
    displayExports(exportsList);
}