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
function switch_iframe(location) {
    var frame = document.getElementById("main-frame");
    frame.src = location;
}


/* button_setup
 * Receives: Nothing
 * Does: Takes button IDs and adds event listeners
 * Returns: Nothing
 */
function button_setup() {
    document.getElementById("samba-btn").addEventListener("click",  function() {switch_iframe("samba-manager/samba-manager.html");});
    document.getElementById("nfs-btn").addEventListener("click", function() {switch_iframe("nfs-manager/nfs-manager.html");});
}

/* add_share
 * Receives: Nothing
 * Does: Start pages scripts
 * Returns: Nothing
 */
function main() {
    button_setup()
}

main()