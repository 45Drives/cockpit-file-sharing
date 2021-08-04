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

/* Name:
 * Receives: ID of what your adding the notfication to.
 * Does: Creates a notifaction object that can be used to set 
 * success and failure messages
 */
export class Notification {
    constructor(id) {
        this.id = id
        this.timeout = 3600
        this.infoTimeout = {}
        
        // Info popup loader
        this.successIconClasses = ["pficon", "pficon-ok"];
        this.failureIconClasses = ["pficon", "pficon-error-circle-o"];
        this.successClasses = ["alert", "alert-success"];
        this.failureClasses = ["alert", "alert-danger"];
        this.allAlertClasses = [...this.successClasses, ...this.failureClasses];
        this.allIconClasses = [
            ...this.successIconClasses,
            ...this.failureIconClasses,
        ];
    }

    // Set timeout
    setTimeout(time) {
        this.timeout = time
    }

    // This function clears all classes that are part of the id-info element. It esentially wipes the elements message.
    clearInfo() {
        let info = document.getElementById(this.id + "-info");
        let infoIcon = document.getElementById(this.id + "-info-icon");
        let infoMessage = document.getElementById(this.id + "-info-text");
        info.classList.remove(...this.allAlertClasses);
        infoIcon.classList.remove(...this.allIconClasses);
        infoMessage.innerText = "";
        return [info, infoIcon, infoMessage];
    }

    // Set an error message for the id of the notification
    setError(message) {
        let [info, infoIcon, infoMessage] = this.clearInfo();
        infoIcon.classList.add(...this.failureIconClasses);
        info.classList.add(...this.failureClasses);
        infoMessage.innerText = message;
        if (typeof this.infoTimeout[this.id] !== "undefined" && this.infoTimeout[this.id] !== null)
            clearTimeout(this.infoTimeout[this.id]);
        if (this.timeout > 0) {
            this.infoTimeout[this.id] = setTimeout(() => {
                this.clearInfo();
            }, this.timeout);
        }
    }

    // Set an success message for the id of the notification
    setSuccess(message) {
        let [info, infoIcon, infoMessage] = this.clearInfo(this.id);
        infoIcon.classList.add(...this.successIconClasses);
        info.classList.add(...this.successClasses);
        infoMessage.innerText = message;
        if (typeof this.infoTimeout[this.id] !== "undefined" && this.infoTimeout[this.id] !== null)
            clearTimeout(this.infoTimeout[this.id]);
        if (this.timeout > 0) {
            this.infoTimeout[this.id] = setTimeout(() => {
                this.clearInfo(this.id);
            }, this.timeout);
        }
    }

}


/* Name: Fatal Error
 * Receives: message to display as fatal error
 * Does: Creates a main notification object, and sets it for infinite time. Disables all buttons.
 * Blurrs screen. Displays fatal error message.
 * Returns: nothing
 */
export function fatalError(message) {
    // Disables screen so user cannot use app
    let allButtons = document.getElementsByTagName("button");
    let backScreen = document.getElementById("blurred-screen");
    let spinner = document.getElementById("spinner");
    spinner.style.display = "none";
    backScreen.style.display = "inline-flex";
    for (let button of allButtons) {
        button.disabled = true;
    }

    // Sets main object, resets timeout, and displays message
    let mainNotification = new Notification("main")
    mainNotification.setTimeout(-1)    
    mainNotification.setError(message)
}