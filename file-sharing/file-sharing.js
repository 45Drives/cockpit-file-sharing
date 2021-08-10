// Cockpit File Sharing - Cockpit plugin for managing file shares.
// Copyright (C) 2021 Sam Silver <ssilver@45drives.com>
// Copyright (C) 2021 Josh Boudreau <jboudreau@45drives.com>

// This file is part of Cockpit File Sharing.
// Cockpit File Sharing is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// Cockpit File Sharing is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// You should have received a copy of the GNU General Public License
// along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.

/* switch_iframe
 * Receives: Src
 * Does: Gets iframe ID and switches the src to inputted value
 * Returns: Nothing
 */
function switch_iframe(is_samba) {
    var frame = document.getElementById("main-frame");

    if (is_samba)  {
        document.getElementById("nfs-btn").classList.remove("tab-selected");
        frame.src = "samba-manager/samba-manager.html"
        document.getElementById("samba-btn").classList.add("tab-selected");
        localStorage.setItem("file_sharing_tab", "samba");
    }
    else {
        document.getElementById("samba-btn").classList.remove("tab-selected");
        frame.src = "nfs-manager/nfs-manager.html"
        document.getElementById("nfs-btn").classList.add("tab-selected");
        localStorage.setItem("file_sharing_tab", "nfs");
    }
}


/* button_setup
 * Receives: Nothing
 * Does: Takes button IDs and adds event listeners
 * Returns: Nothing
 */
function button_setup() {
    document.getElementById("samba-btn").addEventListener("click",  function() {
        if(!document.getElementById("samba-btn").classList.contains("tab-selected")) {
            switch_iframe(true)
        }
    });
    document.getElementById("nfs-btn").addEventListener("click", function() {
        if(!document.getElementById("nfs-btn").classList.contains("tab-selected")) {
            switch_iframe(false)
        }
    });
}

/* add_share
 * Receives: Nothing
 * Does: Start pages scripts
 * Returns: Nothing
 */
function main() {
    let tab = localStorage.getItem("file_sharing_tab")
    if (tab == null) {
        localStorage.setItem("file_sharing_tab", "samba")
    }

    if (tab == "samba") {
        switch_iframe(true);
    } else {
        switch_iframe(false);
    }

    button_setup()
}

main()