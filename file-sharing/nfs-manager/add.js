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

import {Notification} from "../components/notifications.js"

function addExportToConfig(entry) {
    var modal_notification = new Notification("nfs")

    


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


/* Name: Create Nfs
 * Receives: Name of export, export path, all the clients being added which includes their ip and permissions.
 * Does: Takes inputted export name, path and clients, and launches CLI command with said inputs
 * Returns: Nothing
 */
function create_nfs(name, path, client_info) {
    let nfs_notification = new Notification("nfs")
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_add.py", name, path, client_info], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        populateExportList();
        nfs_notification.set_success("Added " + name + " export to the server.");
        hideModal("nfs-modal");
    });
    proc.fail(function (data) {
        nfs_notification.set_error("Could not add export: " + data);
    });
}