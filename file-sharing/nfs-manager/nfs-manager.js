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

// Import components from other scripts
import {Notification, fatal_error} from "../components/notifications.js"

/* Name: show_nfs_modal
 * Receives: Nothing 
 * Does: Shows "Add NFS" pop up
 * Returns: Nothing
 */
function show_nfs_modal() {
    var inputs = document.getElementsByTagName("input");
    
    for (var item in inputs) {
        if(inputs[item].type == "text") {
            inputs[item].value = "";
        }
    }

    document.getElementById("clients").innerHTML = "";
    add_client(false);

    var modal = document.getElementById("nfs-modal");
    modal.style.display = "block";
}

/* Name: Add NFS
 * Receives: Nothing 
 * Does: Collects all added clients, checks if user entered "valid values" and puts all clients into
 * a JSON and runs create NFS with JSON
 * Returns: Nothing
 */
function add_nfs() {
    var modal_notification = new Notification("nfs-modal")

    var name = document.getElementById("input-name").value;
    var path = document.getElementById("input-path").value;

    var client_info = []
    var client_to_add = document.getElementsByClassName('client-to-add');

    for (let i = 0; i < client_to_add.length; i++) {
        client_info.push(client_to_add[i].value)
    }

    var is_clicked = document.getElementById("is-clicked");
    var name_exist = false;

    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_list.py"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function(data) {
        var obj = JSON.parse(data)

        for (var items in obj) {
            if (name == obj[items].Name) {
                name_exist = true;
            }
        }

        if (name == "") {
            modal_notification.set_error("Enter a name.")
        }
        else if(name_exist) {
            modal_notification.set_error("Name already exists.")
        }
        else if (path == "") {
            modal_notification.set_error("Enter a path.")
        }
        else if (path[0] != "/") {
            modal_notification.set_error("Path has to be absolute.")
        }
        else {     
            // Check is IPs are empty
            for (let i = 0; i < client_info.length; i++) {
                //Check ips
                if(i%2 == 0 || i == 0) {
                    if (client_info[i] == "") {
                        client_info[i] = "*";
                    }
                // Check options
                } else {  
                    if (client_info[i] == "") {
                        client_info[i] = "rw,sync,no_subtree_check";
                    } else {
                        // If options string has white space... remove it.
                        client_info[i] = client_info[i].replace(/\s/g, "");
                    }
                }
            }

            let client_obj = JSON.stringify(client_info)

            if (is_clicked.value == path) {
                create_nfs(name, path, client_obj);
            }
            else {
                var proc = cockpit.spawn(["stat", path])
                proc.done(function() {
                    create_nfs(name, path, client_obj);
                });
                proc.fail(function() {
                    is_clicked.value = path
                    modal_notification.set_error("Path does not exist. Press 'Add' again to create.");
                });
            }
        }
    });
}

/* Name: hide_nfs_modal
 * Receives: Nothing 
 * Does: Hides "Add NFS" pop up
 * Returns: Nothing
 */
function hide_nfs_modal() {
    var modal = document.getElementById("nfs-modal");
    modal.style.display = "none";
}

/* Name: clear_setup_spinner
 * Receives: Nothing 
 * Does: Clears spinner logo from screen
 * Returns: Nothing
 */
function clear_setup_spinner() {
    var wrapper = document.getElementById("blurred-screen");
    wrapper.style.display = "none";
}

/* Name: create_nfs
 * Receives: name, path, client_info
 * Does: Takes inputted IP, and path and launches CLI command with said inputs
 * Returns: Nothing
 */
function create_nfs(name, path, client_info) {
    let nfs_notification = new Notification("nfs")
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_add.py", name, path, client_info], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        populate_nfs_list();
        nfs_notification.set_success("Added " + name + " export to the server.");
        hide_nfs_modal();
    });
    proc.fail(function (data) {
        nfs_notification.set_error("Could not add export: " + data);
    });
}

/* Name: add_client
 * Receives: Nothing
 * Does: Adds another ip and options input to add a new client
 * Returns: Nothing
 */
function add_client(spacer) {
    if ((spacer ?? null) === null) spacer = true;

    let client_section = document.getElementById("clients");

    let ip_row = document.createElement("div");
    ip_row.classList.add("form-row");

    let ip_label = document.createElement("label");
    ip_label.classList.add("label-45d");
    ip_label.classList.add("bold-text");
    ip_label.innerText = "Client IP";

    let ip_input = document.createElement("input");
    ip_input.type = "text";
    ip_input.classList.add("client-to-add")
    ip_input.placeholder = "Will default to '*' if left empty"
    
    ip_row.appendChild(ip_label);
    ip_row.appendChild(ip_input);

    let options_row = document.createElement("div");
    options_row.classList.add("form-row");

    let options_label = document.createElement("label");
    options_label.classList.add("label-45d");
    options_label.classList.add("bold-text");
    options_label.innerText = "Options";

    let options_input = document.createElement("input");
    options_input.type = "text";
    options_input.placeholder = "Will default to 'rw,sync,no_subtree_check' if left empty";
    options_input.classList.add("client-to-add")
    
    options_row.appendChild(options_label);
    options_row.appendChild(options_input);

    if (spacer) {
        let divider = document.createElement("div");
        divider.classList.add("pf-c-divider");
        let spacer = document.createElement("div");
        spacer.classList.add("vertical-spacer");

        client_section.appendChild(divider);
        client_section.appendChild(spacer);
    }

    client_section.appendChild(ip_row);
    client_section.appendChild(options_row);
}

/* Name: rm_client
 * Receives: name
 * Does: Runs the nfs_remove script with inputted entry name to remove said NFS.
 * Also removes elements list from table.
 * Returns: Nothing
 */
function rm_client(name, ip) {
    let nfs_notification = new Notification("nfs")
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_remove.py", name, ip], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        populate_nfs_list();
        nfs_notification.set_success("Removed client " + ip + " from " + name + ".");
        hide_rm_client_modal();
    });
    proc.fail(function (data) {
        nfs_notification.set_error("Could not remove client " + ip + " from " + name + ":" + data);
        hide_rm_client_modal();
    });
}

/* Name: show_rm_client_modal
 * Receives: entry_ip
 * Does: Shows remove NFS model
 * Returns: Nothing
 */
function show_rm_client_modal(entry_name, entry_ip) {
    let client_to_rm = document.getElementsByClassName('client-to-remove');
    for (let i = 0; i < client_to_rm.length; i++) {
        client_to_rm[i].innerText = entry_ip + " from " + entry_name;
    }
    var modal = document.getElementById("rm-client-modal");
    modal.style.display = "block";
    var continue_rm_nfs = document.getElementById("continue-rm-client");
    continue_rm_nfs.onclick = function () {
        rm_client(entry_name, entry_ip);
    };
}

/* Name: hide_rm_client_modal
 * Receives: Nothing
 * Does: Hides remove NFS model
 * Returns: Nothing
 */
function hide_rm_client_modal() {
    var modal = document.getElementById("rm-client-modal");
    modal.style.display = "none";
}

/* Name: create_list_entry
 * Receives: name, path, ip, permissions, on_delete 
 * Does: Makes a entry for a list
 * Returns: entry
 */
function create_list_entry(name, path, ip, permissions, on_delete, name_del) {
    if ((name_del ?? null) === null) name_del = name;
    
    var entry = document.createElement("tr");
    entry.classList.add("highlight-entry");

    var entry_name = document.createElement("td");
    entry_name.innerText = name;

    var entry_path = document.createElement("td");
    entry_path.innerText = path;

    var entry_ip = document.createElement("td");
    entry_ip.innerText = ip;

    var entry_permissions = document.createElement("td");
    entry_permissions.innerText = permissions;

    var del = document.createElement("td");
    del.style.padding = "2px"
    del.style.textAlign = "right"
    var del_div = document.createElement("span");
    del_div.classList.add("circle-icon", "circle-icon-danger");
    del_div.addEventListener("click", function () {
        on_delete(name_del, ip);
    });
    del.appendChild(del_div);

    entry.appendChild(entry_name);
    entry.appendChild(entry_path);
    entry.appendChild(entry_ip);
    entry.appendChild(entry_permissions);
    entry.appendChild(del);
    return entry;
}

/* Name: populate_nfs_list
 * Receives: Nothing 
 * Does: Populate the main table with list of current NFS(s).
 * Returns: Nothing
 */
function populate_nfs_list() {
    let nfs_notification = new Notification("nfs")
    var nfs_list = document.getElementById("nfs-list")
    
    while (nfs_list.firstChild) {
        nfs_list.removeChild(nfs_list.firstChild);
    }

    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_list.py"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        var obj = JSON.parse(data)

        if (obj.length === 0) {
            var msg = document.createElement("tr");
            var name = document.createElement("td");
            name.innerText = 'No exports. Click the "plus" to add one.';
            var path = document.createElement("td");
            var ip = document.createElement("td");
            var perm = document.createElement("td");
            var del = document.createElement("td");
            msg.appendChild(name)
            msg.appendChild(ip)
            msg.appendChild(path)
            msg.appendChild(perm)
            msg.appendChild(del)
            nfs_list.appendChild(msg);
        }
        else {
            obj.forEach(function(obj) {
                // Check if there is more clients, if so then iterate through and add new rows
                let len = obj.Clients.length
                for(let i = 0; i < len; i++) {
                    // The very first entry will always go into the first column
                    if (i == 0) {
                        var new_client = create_list_entry(obj.Name, obj.Path, obj.Clients[0][0], obj.Clients[0][1], show_rm_client_modal)
                    }
                    // Entries after will go below first column
                    else {
                        var new_client = create_list_entry(" ", " ", obj.Clients[i][0], obj.Clients[i][1], show_rm_client_modal, obj.Name)
                    }
                    nfs_list.appendChild(new_client);
                }
            });
        }
    });
    proc.fail(function (ex, data) {
        nfs_notification.set_error("Error while populating nfs list: " + data);
    });
}

/* Name: setup
 * Receives: Nothing 
 * Does: awaits populating the list of current NFS(s). Once finished setup buttons and clear branding
 * Returns: Nothing
 */
async function setup() {
    await populate_nfs_list();
    set_up_buttons();
    clear_setup_spinner();
}

/* Name: check_nfs
 * Receives: Nothing 
 * Does: tries running `showmount -e` to check if nfs is installed, if successful, calls setup(), if unsuccessful,
 * shows error message and disables buttons
 * Returns: Nothing
 */
function check_nfs() {
    var proc = cockpit.spawn(["systemctl", "status", "nfs-server"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        setup()
    });
    proc.fail(function () {
        fatal_error("Failed to load NFS services. Is NFS installed or enabled?")
    });
}

/* Name: Check Sudo
 * Receives: Nothing 
 * Does: Checks if user can use sudo. If not, give a fatal error, if yes, call check_nfs.
 * Returns: Nothing
 */
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
            fatal_error("Could not use sudo. Is the machine name in /etc/hosts?")
        }
        else {check_nfs();}
    });
}

/* Name: check_permissions
 * Receives: Nothing 
 * Does: Checks if user is root. If not, give a fatal error, if yes, call check_sudo.
 * Returns: Nothing
 */
function check_permissions() {
    let root_check = cockpit.permission({ admin: true });
	root_check.addEventListener(
		"changed", 
		function() {
			if(root_check.allowed){
                check_sudo();
			}else{
				fatal_error("You do not have administrator access.");
			}
	 	}
	)
}

/* Name: set_up_buttons
 * Receives: Nothing 
 * Does: Sets up buttons
 * Returns: Nothing
 */
function set_up_buttons() {
    document.getElementById("show-nfs-modal").addEventListener("click", show_nfs_modal);
    document.getElementById("hide-nfs-modal").addEventListener("click", hide_nfs_modal);
    document.getElementById("cancel-rm-client").addEventListener("click", hide_rm_client_modal);
    document.getElementById("add-nfs-btn").addEventListener("click", add_nfs);
    document.getElementById("add-client-btn").addEventListener("click", add_client);
}

/* Name: main
 * Receives: Nothing 
 * Does: Runs check_permissions to see if user is superuser
 * Returns: Nothing
 */
function main() {
    check_permissions()
}

main();