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
                    newExport.addClient(false, obj[i]["Clients"][j]["Ip"], obj[i]["Clients"][j]["Permissions"], obj[i]["Clients"][j]["Name"])
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
    let guiList = document.getElementById("export-list")
    guiList.innerHTML = "";

    // If there is no exports then display "help" message
    if (exportsList.length === 0) {
        var msg = document.createElement("div");
        msg.classList.add("grid-header");
        var pullDown = document.createElement("div");
        var name = document.createElement("div");
        name.innerText = 'No exports. Click the "plus" to add one.';
        var path = document.createElement("div");
        var settings = document.createElement("div");
        msg.appendChild(pullDown);
        msg.appendChild(name);
        msg.appendChild(path);
        msg.appendChild(settings);
        guiList.appendChild(msg);
    }
    else {
        // Iterate through each export
        exportsList.forEach(function(obj) {
            obj.listExport();
        });
    }
} 
