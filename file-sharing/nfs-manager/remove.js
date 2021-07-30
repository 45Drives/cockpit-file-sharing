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
import {showModal, hideModal} from "../components/modals.js"

function removeClient(name, ip) {
    let nfs_notification = new Notification("nfs")
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/nfs-manager/scripts/nfs_remove.py", name, ip], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        populateExportList();
        nfs_notification.set_success("Removed client " + ip + " from " + name + ".");
        hideModal("rm-client-modal");
    });
    proc.fail(function (data) {
        nfs_notification.set_error("Could not remove client " + ip + " from " + name + ":" + data);
        hideModal("rm-client-modal");
    });
}

export function showRmClientModal(exportsList, entry_name, entry_ip) {
    let client_to_rm = document.getElementsByClassName('client-to-remove');
    for (let i = 0; i < client_to_rm.length; i++) {
        client_to_rm[i].innerText = entry_ip + " from " + entry_name;
    }

    showModal("rm-client-modal");

    var continue_rm_nfs = document.getElementById("continue-rm-client");
    continue_rm_nfs.onclick = function () {
        removeClient(entry_name, entry_ip);
    };
}