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

// Import needed components
import {NfsExport} from "./exports.js"
import {showRmClientModal} from "./remove.js"

// Create an array of export objects from list script
export function populateExportList() {
    return new Promise((resolve, reject) => {
        // Spawn list script
        var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_list.py"], {
            err: "out",
            superuser: "require",
        });
        proc.done(function (data) {
            // Retrive output from script and turn into a object
            var obj = JSON.parse(data)
            let exportsList = []

            // Loop through list of exports in objext and create export objects for each, push said objects
            // to global exportList
            for (let i = 0; i < obj.length; i++) {
                let newExport = new NfsExport(obj[i]["Name"], obj[i]["Path"])
                for (let j = 0; j < obj[i]["Clients"].length; j++) {
                    newExport.addClient(false, obj[i]["Clients"][j]["Ip"], obj[i]["Clients"][j]["Permissions"])
                }
                
                exportsList.push(newExport)
            }
            
            resolve(exportsList);
        });
        proc.fail(function (data) {
            reject("Error while populating nfs list: " + data)
        });
    });
}

// Display all export objects in export list
export function displayExports(exportsList) {
    // Retrive html div to put list in
    let guiList = document.getElementById("nfs-list")
    guiList.innerHTML = "";

    // If there is no exports then display "help" message
    if (exportsList.length === 0) {
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
        guiList.appendChild(msg);
    }
    else {
        // Iterate through each export
        exportsList.forEach(function(obj) {
            // Iterate through exports clients and create an entry in the list for each
            for (let i = 0; i < obj.clients.length; i++) {
                let newClient = null
                // The very first entry will always go into the first column
                if (i == 0) {
                    newClient = createListEntry(obj.name, obj.path, obj.clients[0].ip, obj.clients[0].permissions, showRmClientModal)
                }
                // Entries after will go below first column
                else {
                    newClient = createListEntry(" ", " ", obj.clients[i].ip, obj.clients[i].permissions, showRmClientModal, obj.name)
                }
                // Add entries to html Div
                guiList.appendChild(newClient); 
            }
        });
    }
} 

// Create a row item to be insterted in a list div
function createListEntry(name, path, ip, permissions, on_delete, name_del) {
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
    del_div.addEventListener("click", () => {
        on_delete(name_del, ip);
    })
    del.appendChild(del_div);

    entry.appendChild(entry_name);
    entry.appendChild(entry_path);
    entry.appendChild(entry_ip);
    entry.appendChild(entry_permissions);
    entry.appendChild(del);
    return entry
}