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
        this.info_timeout = {}
        
        // Info popup loader
        this.success_icon_classes = ["pficon", "pficon-ok"];
        this.failure_icon_classes = ["pficon", "pficon-error-circle-o"];
        this.success_classes = ["alert", "alert-success"];
        this.failure_classes = ["alert", "alert-danger"];
        this.all_alert_classes = [...this.success_classes, ...this.failure_classes];
        this.all_icon_classes = [
            ...this.success_icon_classes,
            ...this.failure_icon_classes,
        ];
    }

    // Set timeout
    set_timeout(time) {
        this.timeout = time
    }

    // This function clears all classes that are part of the id-info element. It esentially wipes the elements message.
    clear_info() {
        let info = document.getElementById(this.id + "-info");
        let info_icon = document.getElementById(this.id + "-info-icon");
        let info_message = document.getElementById(this.id + "-info-text");
        info.classList.remove(...this.all_alert_classes);
        info_icon.classList.remove(...this.all_icon_classes);
        info_message.innerText = "";
        return [info, info_icon, info_message];
    }

    // Set an error message for the id of the notification
    set_error(message) {
        let [info, info_icon, info_message] = this.clear_info();
        info_icon.classList.add(...this.failure_icon_classes);
        info.classList.add(...this.failure_classes);
        info_message.innerText = message;
        if (typeof this.info_timeout[this.id] !== "undefined" && this.info_timeout[this.id] !== null)
            clearTimeout(this.info_timeout[this.id]);
        if (this.timeout > 0) {
            this.info_timeout[this.id] = setTimeout(() => {
                this.clear_info();
            }, this.timeout);
        }
    }

    // Set an success message for the id of the notification
    set_success(message) {
        let [info, info_icon, info_message] = this.clear_info(this.id);
        info_icon.classList.add(...this.success_icon_classes);
        info.classList.add(...this.success_classes);
        info_message.innerText = message;
        if (typeof this.info_timeout[this.id] !== "undefined" && this.info_timeout[this.id] !== null)
            clearTimeout(this.info_timeout[this.id]);
        if (this.timeout > 0) {
            this.info_timeout[this.id] = setTimeout(() => {
                this.clear_info(this.id);
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
export function fatal_error(message) {
    // Disables screen so user cannot use app
    let all_buttons = document.getElementsByTagName("button");
    let backScreen = document.getElementById("blurred-screen");
    let spinner = document.getElementById("spinner");
    spinner.style.display = "none";
    backScreen.style.display = "inline-flex";
    for (let button of all_buttons) {
        button.disabled = true;
    }

    // Sets main object, resets timeout, and displays message
    let main_notification = new Notification("main")
    main_notification.set_timeout(-1)    
    main_notification.set_error(message)
}