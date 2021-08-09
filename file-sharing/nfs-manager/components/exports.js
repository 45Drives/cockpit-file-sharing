/* 
    Cockpit File Sharing - Cockpit plugin for managing file shares.
    Copyright (C) 2021 Sam Silver <ssilver@45drives.com>
    
    This file is part of Cockpit File Sharing.
    Cockpit File Sharing is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Cockpit File Sharing is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.  
*/

// Import components
import {showModal, hideModal} from "../../components/modals.js"
import {Notification} from "../../components/notifications.js"
import {refreshList, showEdit} from "../nfs-manager.js";

// Client object that is constructed with variables
class Client {
    constructor(name, parentExport="", ip="", permissions="") {
        this.name = name;
        this.parentExport = parentExport;
        this.ip = ip;
        this.permissions = permissions;
    }

    // HTML when user is adding a client
    inputClient() {
        let client_section = document.getElementById("clients");

        let client_div = document.createElement("div");
        client_div.classList.add("allign");

        let arrow = document.createElement("div");
        arrow.classList.add("arrow");

        let inputs = document.createElement("div");

        let ip_row = document.createElement("div");
        ip_row.classList.add("form-row");

        let ip_label = document.createElement("label");
        ip_label.classList.add("label-45d", "bold-text");
        ip_label.innerText = "Client IP";

        let ipText = this.ip
        this.ip = document.createElement("input");
        this.ip.type = "text";
        this.ip.classList.add("client-to-add")
        this.ip.placeholder = "Will default to '*' if left empty"
        this.ip.value = ipText;
        
        ip_row.appendChild(ip_label);
        ip_row.appendChild(this.ip);

        let options_row = document.createElement("div");
        options_row.classList.add("form-row");

        let options_label = document.createElement("label");
        options_label.classList.add("label-45d", "bold-text");
        options_label.innerText = "Options";

        let perText = this.permissions
        this.permissions = document.createElement("input");
        this.permissions.type = "text";
        this.permissions.placeholder = "Will default to 'rw,sync,no_subtree_check' if left empty";
        this.permissions.classList.add("client-to-add")
        this.permissions.value = perText;
        
        options_row.appendChild(options_label);
        options_row.appendChild(this.permissions);

        inputs.appendChild(ip_row);
        inputs.appendChild(options_row);

        let spacer = document.createElement("div")
        spacer.classList.add("vertical-spacer")

        let del = document.createElement("div");
        del.classList.add("end-del")
        let del_div = document.createElement("flex")
        del_div.classList.add("circle-icon", "circle-icon-danger");
        del_div.addEventListener("click", () => {
            client_section.removeChild(client_div);
            client_section.removeChild(spacer);
            this.parentExport.rmClientFromExport(this.name);
        })
        del.appendChild(del_div);

        client_div.appendChild(arrow);
        client_div.appendChild(inputs);
        client_div.appendChild(del);

        client_section.appendChild(client_div);
        client_section.appendChild(spacer);
    }

    // HTML for the list of clients
    listClient() {
        let guiList = document.getElementById("nfs-list")

        let entry = document.createElement("tr");
        entry.classList.add("highlight-entry");

        let entry_ip = document.createElement("td");
        entry_ip.innerText = this.ip;

        let entry_permissions = document.createElement("td");
        entry_permissions.innerText = this.permissions;

        let del = document.createElement("td");
        del.style.padding = "2px"
        del.style.textAlign = "right"
        let del_div = document.createElement("span");
        del_div.classList.add("circle-icon", "circle-icon-danger");
        del_div.addEventListener("click", () => {
            this.showRmClient();
        })
        del.appendChild(del_div);

        entry.appendChild(entry_ip);
        entry.appendChild(entry_permissions);
        entry.appendChild(del);
        guiList.append(entry);
    }

    // Remove client from config
    removeClient() {
        // Create a promise to give a success or error
        return new Promise((resolve,reject) => {
            // Proc nfs remove script passing clients parent and ip
            var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_remove.py", this.parentExport, this.ip], {
                err: "out",
                superuser: "require",
            });
            proc.done(() => {
                // Success
                resolve("Removed client " + this.ip + " from " + this.parentExport + ".");
            });
            proc.fail((data) => {
                // Error
                reject("Failed to remove client: " + data);
            });
        }); 
    }

    // Show remove client modal
    showRmClient() {
        // Create a notification object for main page
        let nfsNotification = new Notification("nfs")

        // Get areas where to fill inner text with info of client to remove
        let clientToRm = document.getElementsByClassName('client-to-remove');
        for (let i = 0; i < clientToRm.length; i++) {
            clientToRm[i].innerText = "client " + this.ip + " from " + this.parentExport;
        }
        
        showModal("rm-client-modal");

        // Add function to remove button
        let continue_rm_nfs = document.getElementById("continue-rm-client");
        continue_rm_nfs.onclick = async () => {
            try {
                // Proc remove function to see if it succeeds or fails
                let msg = Promise.resolve(await this.removeClient());
                msg.then(value => {
                    nfsNotification.setSuccess(value)
                });
            }
            catch (err) {
                // Error
                nfsNotification.setError(err)
            }
            // Reset list and then hide modal
            await refreshList();
            hideModal("rm-client-modal");
        };
    }
}

// Export object that holds a list of clients
export class NfsExport {
    constructor(name="", path="") {
        this.name = name;
        this.path = path;
        this.clients = [];
        this.clientNames = 0;
    }

    // Add clients
    addClient(html,ip=null, permissions=null) {
        this.clientNames += 1;
        let clientName = "Client " + (this.clientNames);
        let client = new Client(clientName, this, ip, permissions);
        // Add input html if the client is being added in modal
        if (html) {
            client.inputClient()
        }
        // add client to export's list
        this.clients.push(client);
    }

    // HTML for export in list
    listExport() {
        let guiList = document.getElementById("nfs-list")

        let entry = document.createElement("tr");
        entry.classList.add("highlight-entry");

        let entry_name = document.createElement("td");
        entry_name.innerText = this.name;

        let entry_path = document.createElement("td");
        entry_path.innerText = this.path;

        let del = document.createElement("td");
        del.classList.add("dropdown")
        del.style.padding = "2px"
        del.style.textAlign = "right"

        let dropDown = document.createElement("div");
        dropDown.classList.add("dropdown-content");
        let remove = document.createElement("a");
        remove.innerText = "Remove";
        remove.addEventListener('click', () => {
            this.showRmExport();
        });
        let edit = document.createElement("a");
        edit.innerText = "Edit";
        edit.addEventListener('click', () => {
            showEdit(this);
        });
        dropDown.appendChild(remove);
        dropDown.appendChild(edit);
        
        let del_div = document.createElement("span");
        del_div.classList.add("fa", "fa-ellipsis-v", "edit-export");
        del_div.addEventListener("click", () => {
            dropDown.classList.toggle("show");
        })
        del.appendChild(del_div);
        del.appendChild(dropDown);

        entry.appendChild(entry_name);
        entry.appendChild(entry_path);
        entry.appendChild(del);
        guiList.append(entry);
    }

    // Remove a whole export from config
    removeExport() {
        // Pass the name of the export to nfs remove script
        return new Promise((resolve,reject) => {
            var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_remove.py", "--export", this.name], {
                err: "out",
                superuser: "require",
            });
            proc.done(() => {
                resolve("Removed " + this.name);
            });
            proc.fail((data) => {
                reject("Failed to remove export: " + data);
            });
        }); 
    }

    // Show remove export modal
    showRmExport() {
        // Create a notification object for main page of nfs
        let nfsNotification = new Notification("nfs")

        // Get areas where to fill info about export that is being removed
        let exportToRm = document.getElementsByClassName('client-to-remove');
        for (let i = 0; i < exportToRm.length; i++) {
            exportToRm[i].innerText = this.name + " export";
        }
            
        showModal("rm-client-modal");

        // Add function to call remove export to continue remove button
        let continue_rm_nfs = document.getElementById("continue-rm-client");
        continue_rm_nfs.onclick = async () => {
            try {
                let msg = Promise.resolve(await this.removeExport());
                msg.then(value => {
                    nfsNotification.setSuccess(value)
                });
            }
            catch (err) {
                nfsNotification.setError(err)
            }
            // Reset list and hide modal
            await refreshList();
            hideModal("rm-client-modal");
        };
    }

    // Remove the client from export
    rmClientFromExport(clientName) {
        this.clients = this.clients.filter((client) => {return client.name != clientName}); 
    }
}

// Check through input values in modal to add to export entry
export function newExportEntry(newExport, exportsList, nameException="") {
    // Get inputed values
    let exportName = document.getElementById("input-name").value;
    let path = document.getElementById("input-path").value;

    // Variable to see if button was perviously clicked
    let is_clicked = document.getElementById("is-clicked");

    // Check if name already exists in list
    let nameExist = false
    exportsList.forEach(nfsExport => {
        if (nfsExport.name == exportName) {
            nameExist = true;
        }
    })

    // Check if user entered correct info
    return new Promise((resolve, reject) => {
        if (exportName == "") {
            reject("Enter a name.");
        }
        else if(nameExist && (exportName != nameException)) {
            reject("Name already exists.");
        }
        else if (path == "") {
            reject("Enter a path.");
        }
        else if (path[0] != "/") {
            reject("Path has to be absolute.");
        }
        else if (newExport.clients.length == 0) {
            reject("Atleast one client is required.")
        }
        // Add clients user has added
        else if (is_clicked.value == path) {
            resolve(sendNewExport(newExport, exportName, path));
        }
        else {
            // Check if path already exists
            let proc = cockpit.spawn(["stat", path])
            proc.done(function() {
                resolve(sendNewExport(newExport, exportName, path));
            });
            proc.fail(function() {
                is_clicked.value = path
                reject("Path does not exist. Press 'Add' again to create.");
            });
        }
    });
}

// Iterate through each client to check if default values are needed
function sendNewExport(newExport, exportName, path) {
    // Add inputs to the export
    newExport.name = exportName
    newExport.path = path

    // Iterate through each client to check if default values are needed
    newExport.clients.forEach(client => {
        // Deafult values for each input
        let ip = "*"
        let permissions = "rw,sync,no_subtree_check"

        // Check it both IP and Permissions needs default values
        if (client.ip.value != "") {
            ip = client.ip.value
        }

        if (client.permissions.value != "") {
            permissions = client.permissions.value.replace(/\s/g, "") // replace function gets rid of white space
        } 

        // Add the "real" values to client
        client.ip = ip
        client.permissions = permissions
        client.parentExport = exportName
    });

    return newExport
}

// Add a export and its clients to the export config
export function createNfs(entry) {
    // Proc the nfs add script in a promise to return a success or fail
    return new Promise((resolve, reject) => {
        var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_add.py", JSON.stringify(entry)], {
            err: "out",
            superuser: "require",
        });
        proc.done(function () {
            resolve("Added " + entry.name + " export to the server.");
        });
        proc.fail(function (data) {
            reject("Could not add export: " + data);
        });
    });
}

// Add a existing export and its clients in the export config
export function editNfs(entry, oldExportName) {
    // Proc the nfs add script in a promise to return a success or fail
    return new Promise((resolve, reject) => {
        var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_add.py", "--edit", oldExportName, JSON.stringify(entry)], {
            err: "out",
            superuser: "require",
        });
        proc.done(function () {
            resolve("Edited " + oldExportName);
        });
        proc.fail(function (data) {
            reject("Could edit export: " + data);
        });
    });
}