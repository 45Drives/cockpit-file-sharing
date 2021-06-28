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

// Info popup loader
var success_icon_classes = ["pficon", "pficon-ok"];
var failure_icon_classes = ["pficon", "pficon-error-circle-o"];
var success_classes = ["alert", "alert-success"];
var failure_classes = ["alert", "alert-danger"];
var all_alert_classes = [...success_classes, ...failure_classes];
var all_icon_classes = [
    ...success_icon_classes,
    ...failure_icon_classes,
];

const timeout_ms = 3600; // info message timeout

var info_timeout = {}; // object to hold timeouts returned from setTimeout

/* Name: clear_info
 * Receives: id string for info fields in DOM
 * Does: clears alert
 * Returns: element objects for info div, icon, and text
 */
function clear_info(id) {
    var info = document.getElementById(id + "-info");
    var info_icon = document.getElementById(id + "-info-icon");
    var info_message = document.getElementById(id + "-info-text");
    info.classList.remove(...all_alert_classes);
    info_icon.classList.remove(...all_icon_classes);
    info_message.innerText = "";
    return [info, info_icon, info_message];
}

/* Name: set_error
 * Receives: id string for info fields in DOM, error message, optional timeout
 * time in milliseconds to clear message
 * Does: calls clear_info, sets icon and div to error classes, sets text to message,
 * clears old timeout, sets new timeout if passed.
 * Returns: nothing
 */
function set_error(id, message, timeout = -1) {
    [info, info_icon, info_message] = clear_info(id);
    info_icon.classList.add(...failure_icon_classes);
    info.classList.add(...failure_classes);
    info_message.innerText = message;
    if (typeof info_timeout[id] !== "undefined" && info_timeout[id] !== null)
        clearTimeout(info_timeout[id]);
    if (timeout > 0) {
        info_timeout[id] = setTimeout(function () {
            clear_info(id);
        }, timeout);
    }
}

/* Name: set_success
 * Receives: id string for info fields in DOM, message, optional timeout time
 * in milliseconds to clear message
 * Does: calls clear_info, sets icon and div to success classes, sets text to message,
 * clears old timeout, sets new timeout if passed.
 * Returns: nothing
 */
function set_success(id, message, timeout = -1) {
    [info, info_icon, info_message] = clear_info(id);
    info_icon.classList.add(...success_icon_classes);
    info.classList.add(...success_classes);
    info_message.innerText = message;
    if (typeof info_timeout[id] !== "undefined" && info_timeout[id] !== null)
        clearTimeout(info_timeout[id]);
    if (timeout > 0) {
        info_timeout[id] = setTimeout(function () {
            clear_info(id);
        }, timeout);
    }
}

/* Name: fatal_error
 * Receives: message
 * Does: calls set_error for infinite time with message attached. Disables all buttons.
 * clears old timeout, sets new timeout if passed.
 * Returns: nothing
 */
function fatal_error(message) {
    set_error("main", message);
    var all_buttons = document.getElementsByTagName("button");
    var backScreen = document.getElementById("blurred-screen");
    var spinner = document.getElementById("spinner");
    spinner.style.display = "none";
    backScreen.style.display = "inline-flex";
    for (let button of all_buttons) {
        button.disabled = true;
    }
}


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

    var modal = document.getElementById("nfs-modal");
    modal.style.display = "block";
}

function add_nfs() {
    var ip = document.getElementById("input-ip").value;
    var path = document.getElementById("input-path").value;
    var name = document.getElementById("input-name").value;
    var options = document.getElementById("input-perms").value;
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
            set_error("nfs-modal", "Enter a name.", timeout_ms)
        }
        else if(name_exist) {
            set_error("nfs-modal", "Name already exists.", timeout_ms)
        }
        else if (path == "") {
            set_error("nfs-modal", "Enter a path.", timeout_ms)
        }
        else if (path[0] != "/") {
            set_error("nfs-modal", "Path has to be absolute.", timeout_ms)
        }
        else if (ip == "") {
            set_error("nfs-modal", "Enter an IP.", timeout_ms)
        }
        else {     
            if (options == "") {
                options = "rw,sync,no_subtree_check";
            }
            if (is_clicked.value == path) {
                create_nfs(ip, path, name, options);
            }
            else {
                var proc = cockpit.spawn(["stat", path])
                proc.done(function() {
                    create_nfs(ip, path, name, options);
                });
                proc.fail(function() {
                    is_clicked.value = path
                    set_error("nfs-modal", "Path does not exist. Press 'Add' again to create.", timeout_ms);
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
 * Receives: Nothing 
 * Does: Takes inputted IP, and path and launches CLI command with said inputs
 * Returns: Nothing
 */
function create_nfs(ip, path, name, options) {
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_add.py", name, path, ip, options], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        populate_nfs_list();
        set_success("nfs", "Added " + name + " NFS to server.", timeout_ms);
        hide_nfs_modal();
    });
    proc.fail(function (data) {
        set_error("nfs-modal", "Could not add NFS: " + data, timeout_ms);
    });
}

/* Name: rm_nfs
 * Receives: name
 * Does: Runs the nfs_remove script with inputted entry name to remove said NFS.
 * Also removes elements list from table.
 * Returns: Nothing
 */
function rm_nfs(name) {
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_remove.py", name], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        populate_nfs_list();
        set_success("nfs", "Removed " + name + " NFS from server.", timeout_ms);
        hide_rm_nfs_modal();
    });
    proc.fail(function (data) {
        set_error("nfs", "Could not remove NFS: " + data, timeout_ms);
        hide_rm_nfs_modal();
    });
}

/* Name: show_rm_nfs_modal
 * Receives: entry_name
 * Does: Shows remove NFS model
 * Returns: Nothing
 */
function show_rm_nfs_modal(entry_name) {
    var nfs_to_rm = document.getElementsByClassName('nfs-to-remove');
    for (var items in nfs_to_rm) {
        nfs_to_rm[items].innerText = entry_name;
    }
    var modal = document.getElementById("rm-nfs-modal");
    modal.style.display = "block";
    var continue_rm_nfs = document.getElementById("continue-rm-nfs");
    continue_rm_nfs.onclick = function () {
        rm_nfs(entry_name);
    };
}

/* Name: hide_rm_nfs_modal
 * Receives: Nothing
 * Does: Hides remove NFS model
 * Returns: Nothing
 */
function hide_rm_nfs_modal() {
    var modal = document.getElementById("rm-nfs-modal");
    modal.style.display = "none";
}

/* Name: create_list_entry
 * Receives: name, path, ip, permissions, on_delete 
 * Does: Makes a entry for a list
 * Returns: entry
 */
function create_list_entry(name, path, ip, permissions, on_delete) {
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
        on_delete(name);
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
            name.innerText = 'No NFSs. Click the "plus" to add one.';
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
                var item = create_list_entry(obj.Name, obj.Path, obj.IP, obj.Permissions, show_rm_nfs_modal)
                nfs_list.appendChild(item);
            });
        }
    });
    proc.fail(function (ex, data) {
        set_error("nfs", "Error while populating nfs list: " + data);
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
    var proc = cockpit.spawn(["showmount", "-e"], { superuser: "require" });
    proc.done(function () {
        setup()
    });
    proc.fail(function (data) {
        fatal_error("Failed to load NFS services. Is NFS installed or enabled?")
    });
}

/* Name: check_permissions
 * Receives: Nothing 
 * Does: Checks if user is root. If not, give a fatal error, if yes, call check_nfs.
 * Returns: Nothing
 */
function check_permissions() {
    let root_check = cockpit.permission({ admin: true });
	root_check.addEventListener(
		"changed", 
		function() {
			if(root_check.allowed){
				check_nfs();
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
    document.getElementById("cancel-rm-nfs").addEventListener("click", hide_rm_nfs_modal);
    document.getElementById("add-nfs-btn").addEventListener("click", add_nfs);
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