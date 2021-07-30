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

/* Name: Client 
 * Receives: Ip of client and permissions of client
 * Does: Client object for exports 
 */
class Client {
    constructor(name, parentExport, ip="", permissions="") {
        this.name = name;
        this.parentExport = parentExport;
        this.ip = ip;
        this.permissions = permissions;
    }

    inputClient() {
        let client_section = document.getElementById("clients");

        let ip_row = document.createElement("div");
        ip_row.classList.add("form-row");

        let ip_label = document.createElement("label");
        ip_label.classList.add("label-45d");
        ip_label.classList.add("bold-text");
        ip_label.innerText = "Client IP";

        this.ip = document.createElement("input");
        this.ip.type = "text";
        this.ip.classList.add("client-to-add")
        this.ip.placeholder = "Will default to '*' if left empty"
        
        ip_row.appendChild(ip_label);
        ip_row.appendChild(this.ip);

        let options_row = document.createElement("div");
        options_row.classList.add("form-row");

        let options_label = document.createElement("label");
        options_label.classList.add("label-45d");
        options_label.classList.add("bold-text");
        options_label.innerText = "Options";

        this.permissions = document.createElement("input");
        this.permissions.type = "text";
        this.permissions.placeholder = "Will default to 'rw,sync,no_subtree_check' if left empty";
        this.permissions.classList.add("client-to-add")
        
        options_row.appendChild(options_label);
        options_row.appendChild(this.permissions);

        client_section.appendChild(ip_row);
        client_section.appendChild(options_row);
    }

    listClient() {
        let guiList = document.getElementById("nfs-list")

        let entry = document.createElement("tr");
        entry.classList.add("highlight-entry");

        let entry_name = document.createElement("td");
        entry_name.innerText = this.name;

        let entry_path = document.createElement("td");
        entry_path.innerText = " ";

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
            this.deleteClient();
        })
        del.appendChild(del_div);

        entry.appendChild(entry_name);
        entry.appendChild(entry_path);
        entry.appendChild(entry_ip);
        entry.appendChild(entry_permissions);
        entry.appendChild(del);
        guiList.append(entry);
    }

    deleteClient() {
        console.log("Deleting " + this.ip + " from " + this.parentExport)
    }
}

/* Name: NfsExport 
 * Receives: Name of export
 * Does: Holds list of client objects 
 */
export class NfsExport {
    constructor(name="", path="") {
        this.name = name;
        this.path = path;
        this.clients = [];
    }

    // Add clients
    addClient(html,ip=null, permissions=null) {
        let clientName = "Client " + (this.clients.length+1)
        let client = new Client(clientName, this.name, ip, permissions);
        if (html) {
            client.inputClient()
        }
        this.clients.push(client);
    }
}

export function newExportEntry(newExport, exportsList) {
    let exportName = document.getElementById("input-name").value;
    let path = document.getElementById("input-path").value;

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
            reject("Enter a name.")
        }
        else if(nameExist) {
            reject("Name already exists.")
        }
        else if (path == "") {
            reject("Enter a path.")
        }
        else if (path[0] != "/") {
            reject("Path has to be absolute.")
        }
        // Add clients user has added
        else if (is_clicked.value == path) {
            resolve(sendNewExport(newExport, exportName, path));
        }
        else {
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
    });

    return newExport
}