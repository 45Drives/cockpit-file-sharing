/* 
    Cockpit File Sharing - Cockpit plugin for managing file shares.
    Copyright (C) 2021 Sam Silver <ssilver@45drives.com>
    Copyright (C) 2021 Josh Boudreau <jboudreau@45drives.com>
    
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

/* Name: Show Modal
 * Receives: Name of modal as a string, and any extra functions that need to take place
 * Does: Shows "name" pop up and runs any extra functions
 * Returns: Nothing
 */
/**
 * 
 * @param {String} name 
 * @param {Function} extraFunction 
 */
export function showModal(name, extraFunction=() => {}) {
    extraFunction();

    var modal = document.getElementById(name);
    modal.style.display = "block";
}

/* Name: Hide Modal
 * Receives: Name of modal as a string, and any extra functions that need to take place
 * Does: Hides "name" pop up and runs any extra functions
 * Returns: Nothing
 */
/**
 * 
 * @param {String} name 
 * @param {Function} extraFunction 
 */
export function hideModal(name, extraFunction=() => {}) {
    extraFunction();

    var modal = document.getElementById(name);
    modal.style.display = "none";
}