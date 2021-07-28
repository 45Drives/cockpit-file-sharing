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

import {Notification} from "../components/notifications.js"

/* Name: Client 
 * Receives: Ip of client and permissions of client
 * Does: Client object for exports 
 */
export class Client {
    constructor(ip, permissions) {
        this.ip = ip;
        this.permissions = permissions;
    }

    // IP getter
    get clientIp() {
        return this.ip;
    }
    
    // Permissions getter
    get clientPerms() {
        return this.permissions;
    }
}

/* Name: NfsExport 
 * Receives: Name of export
 * Does: Holds list of client objects 
 */
export class NfsExport {
    constructor(name) {
        this.name = name;
        this.clients = [];
    }

    // Name getter
    get exportName() {
        return this.name;
    }

    // Clients getter
    displayClients() {
        console.log(this.clients);
        return this.clients
    }

    // Add clients
    addClient(ip, permissions) {
        let client = new Client(ip, permissions);
        this.clients.push(client);
    }
}

export function addExport() {
    var modalNotification = new Notification("nfs-modal")

    var name = document.getElementById("input-name").value;
    var path = document.getElementById("input-path").value;
    var clientsToAdd = document.getElementsByClassName('client-to-add');

    // List out all exports
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_list.py"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function(data) {
        var obj = JSON.parse(data)
        let nameExist = false;

        // See if name already exist
        for (var items in obj) {
            if (name == obj[items].Name) {
                nameExist = true;
            }
        }

        // Check if user entered correct info
        if (name == "") {
            modalNotification.set_error("Enter a name.")
        }
        else if(nameExist) {
            modalNotification.set_error("Name already exists.")
        }
        else if (path == "") {
            modalNotification.set_error("Enter a path.")
        }
        else if (path[0] != "/") {
            modalNotification.set_error("Path has to be absolute.")
        }
        // Add clients user has added
        else {
            // Create the export with inputed name
            let newExport = new NfsExport(name)

            // Loop through all added clients
            for (let i = 0; i < clientsToAdd.length; i+2) {
                let ip = "*"
                let permissions = "rw,sync,no_subtree_check"

                // Get IPs of clients
                if (clientsToAdd[i].value != "") {
                    ip = clientsToAdd[i].value
                }

                // Get Permissions of clients
                if (clientsToAdd[i+1].value == "") {
                    permissions = clientsToAdd[i].value.replace(/\s/g, "") // replace function gets rid of white space
                } 

                // Create client object with ip and permissions
                newExport.addClient(ip, permissions)
            }

            // Make json object
            let client_obj = JSON.stringify(client_info);
            console.log(client_obj)
        }
    });
}