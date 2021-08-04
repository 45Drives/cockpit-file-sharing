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

// Import components
import {fatalError, Notification} from "../components/notifications.js"
import {showModal, hideModal} from "../components/modals.js"

var selections = [];

var disallowed_groups = [];
var valid_groups = [];

var global_samba_conf = {};

var using_domain = false;
var domain_lower_limit;

var windows_acl_parms = {
    "map-acl-inherit": "yes",
    "acl_xattr:ignore-system-acl": "yes"
};

/* get_global_conf
 * Receives: nothing
 * Does: parses content of /etc/samba/smb.conf to get global options
 * Returns: promise
 */
function get_global_conf() {
    var proc = cockpit.spawn(["cat", "/etc/samba/smb.conf"]);
    proc.done(function (data) {
        const [shares, global_conf] = parse_shares(data.split("\n"));
        for (let key of Object.keys(global_conf)) {
            global_samba_conf[key] = global_conf[key];
        }
    });
    proc.fail(function (data) {
        fatalError("Failed to load smb.conf: " + data);
    });
    return proc;
}

/* get_domain_range
 * Receives: nothing
 * Does: gets lower limit of uid/gid mappings for domain users/groups and stores in global var
 * Returns: nothing
 */
function get_domain_range() {
    if (
        "security" in global_samba_conf &&
        global_samba_conf["security"] === "ads"
    ) {
        using_domain = true;
        // TODO: Find lower limit of idmap ranges
        for (let key of Object.keys(global_samba_conf)) {
            if (/idmap-config.*range/.test(key)) {
                var lower_range = parseInt(
                    global_samba_conf[key].split("-")[0].trim()
                );
                if (
                    typeof domain_lower_limit === "undefined" ||
                    lower_range < domain_lower_limit
                )
                    domain_lower_limit = lower_range;
            }
        }
    }
}

/* set_current_user
 * Receives: DOM element object for selector list
 * Does: Calls `whoami`, uses return value to set default list selection to
 * current logged in user
 * Returns: nothing
 */
function set_current_user(selector) {
    var proc = cockpit.spawn(["whoami"]);
    proc.done(function (data) {
        data = data.trim();
        selector.value = data;
        update_username_fields();
    });
}

/* add_user_options
 * Receives: nothing
 * Does: parses /etc/passwd to get a list of users, filtering out system users
 * with $SHELL == nologin, then populates user-selection select dropdown with
 * one option per user
 * Returns: nothing
 */
function add_user_options() {
    let userNotification = new Notification("user-select")
    userNotification.setSpinner();
    var selects = document.getElementsByClassName("user-selection");
    // clear existing
	for(let select of selects){
		var placeholder = null;
		while (select.firstChild) {
			if(select.firstChild.classList && select.firstChild.classList.contains("placeholder"))
				placeholder = select.firstChild.cloneNode(true);
			select.removeChild(select.firstChild);
		}
		if(placeholder)
			select.appendChild(placeholder);
	}
    var proc = cockpit.spawn(["getent", "passwd"], { err: "out" });
    proc.done(function (data) {
        var rows = data.split("\n");
        var users = rows.filter(
            (row) =>
                row.length != 0 &&
                !row.match("nologin$") &&
                !row.match("^ntp:") &&
                !row.match("^git:")
        );
        users = users.sort();
        users.forEach(function (user_row) {
            var fields = user_row.split(":");
            var user = fields[0];
            var uid = parseInt(fields[2]);
            var option = document.createElement("option");
            option.value = user;
            option.innerHTML = user;
            for (let select of selects)
                if (
                    !using_domain ||
                    uid < domain_lower_limit ||
                    select.classList.contains("use-domain")
                )
                    select.add(option.cloneNode(true));
            option.remove();
        });
        set_current_user(document.getElementById("user-selection"));
        userNotification.clearInfo();
    });
    proc.fail(function (ex, data) {
        userNotification.setError("Failed to get list of users: " + data);
    });
    return proc;
}

/* update_username_fields
 * Receives: nothing
 * Does: replaces innerText of each element in username-45d class
 * with the value of the user-selection dropdown, then calls
 * set_curr_user_group_list
 * Returns: nothing
 */
function update_username_fields() {
    var user = document.getElementById("user-selection").value;
    var fields = document.getElementsByClassName("username-45d");
    for (let field of fields) {
        field.innerText = user;
    }
    set_curr_user_group_list();
}

/* add_group_options
 * Receives: nothing
 * Does: clears group management list and group select lists, then
 * parses /etc/group to repopulate these lists
 * Returns: nothing
 */
async function add_group_options() {
    let groupNotification = new Notification("add-group");
    groupNotification.setSpinner();

    var selects = document.getElementsByClassName("group-selection");
    var groups_list = document.getElementById("groups-list");
    var groups_list_for_user = document.getElementById("groups-list-for-user");

    for (let select of selects) {
        var placeholder = null;
        while (select.firstChild) {
            if (
                select.firstChild.classList &&
                select.firstChild.classList.contains("placeholder")
            )
                placeholder = select.firstChild.cloneNode(true);
            select.removeChild(select.firstChild);
        }
        if (placeholder) select.appendChild(placeholder);
    }

    while (groups_list.firstChild) {
        groups_list.removeChild(groups_list.firstChild);
    }

    while (groups_list_for_user.firstChild) {
        groups_list_for_user.removeChild(groups_list_for_user.firstChild);
    }

    var proc = cockpit.spawn(["getent", "group"], { err: "out" });
    proc.done(function (data) {
        var rows = data.split("\n");
        // get groups with gid >= 1000
        valid_groups.length = disallowed_groups.length = 0;
        rows.forEach(function (row) {
            var fields = row.split(":");
            var group = fields[0];
            var gid = parseInt(fields[2]);
            if (fields.length < 3 || gid < 1000) disallowed_groups.push(group);
            else {
                var option = document.createElement("option");
                option.value = group;
                option.innerHTML = group;
                for (let select of selects)
                    if (
                        !using_domain ||
                        gid < domain_lower_limit ||
                        select.classList.contains("use-domain")
                    )
                        select.add(option.cloneNode(true));
                if (!using_domain || gid < domain_lower_limit)
                    valid_groups.push(group);
                option.remove();
            }
        });
        valid_groups.sort();
        valid_groups.forEach(function (group) {
            groups_list.appendChild(create_group_list_entry(group));
            groups_list_for_user.appendChild(
                create_group_list_entry_for_selection(group)
            );
        });
        groupNotification.clearInfo();
    });
    proc.fail(function (ex, data) {
        groupNotification.setError("Failed to get list of groups: " + data);
    });
    return proc;
}

/* set_curr_user_group_list
 * Receives: nothing
 * Does: calls `groups <selected user>`, parsing output to populate list of groups
 * the selected user is currently in
 * Returns: nothing
 */
function set_curr_user_group_list() {
    let userNotification = new Notification("user-select");
    userNotification.setSpinner();
    
    var user = document.getElementById("user-selection").value;
    var user_list = document.getElementById("user-group-list");

    while (user_list.firstChild) {
        user_list.removeChild(user_list.firstChild);
    }

    var proc = cockpit.spawn(["groups", user], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        var group_list = data.trim().split(" ");
        if (
            group_list.length >= 2 &&
            group_list[0] === user &&
            group_list[1] === ":"
        )
            group_list = group_list.slice(2);
        group_list = group_list.filter(
            (group) => group.length > 0 && !disallowed_groups.includes(group)
        );
        group_list.sort();
        group_list.forEach((group) =>
            user_list.appendChild(create_user_group_list_entry(group))
        );
        userNotification.clearInfo();
    });
    proc.fail(function (ex, data) {
        document.getElementById("user-group-list").innerText =
            "Could not determine current groups.";
        userNotification.clearInfo();
    });
}

/* add_to_group
 * Receives: nothing
 * Does: adds selected user to selected group by calling `usermod -aG <group> <user>`
 * Returns: nothing
 */
function add_to_group(new_list) {
    let groupNotification = new Notification("add-group");
    groupNotification.setSpinner();

    selections = new_list;
    var user = document.getElementById("user-selection").value;
    var proc = cockpit.spawn(["usermod", "-aG", selections.join(","), user], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        groupNotification.setSuccess("Successfully added " + user + " to " + selections.join(", ") + ".");
        set_curr_user_group_list();
        selections = [];
    });
    proc.fail(function (ex, data) {
        groupNotification.setError(data);
        selections = [];
    });
}

/* check_duplicates
 * Receives: nothing
 * Does: checks groups user is in and removes groups user is already in from selections
 * Also sets up error message letting user know group was not added
 * Returns: Nothing
 */
function check_duplicates() {
    let groupNotification = new Notification("add-group");
    let failNotification = new Notification("fail-group");

    var user = document.getElementById("user-selection").value;
    var proc = cockpit.spawn(["groups", user], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        var duplicates = [];
        var group_list = data.trim().split(" ");
        if (
            group_list.length >= 2 &&
            group_list[0] === user &&
            group_list[1] === ":"
        )
            group_list = group_list.slice(2);
        group_list = group_list.filter(
            (group) => group.length > 0 && !disallowed_groups.includes(group)
        );

        for (var selectedItems in selections) {
            if (group_list.includes(selections[selectedItems])) {
                duplicates.push(selections[selectedItems]);
            }
        }

        selections = selections.filter((group) => !duplicates.includes(group));

        if (selections.length != 0) 
            add_to_group(selections);
        if (duplicates != 0)
            failNotification.setError(user + " is already in " + duplicates.join(", ") + ".");
        hideModal("add-user-group-modal");
    });
    proc.fail(function (ex, data) {
        groupNotification.setError(data);
    });
}

/* show_rm_from_group_dialog
 * Receives: nothing
 * Does: shows modal dialog to confirm before removing selected user from selected group
 * Returns: nothing
 */
function show_rm_from_group_dialog(group_name, element_list) {
    var group_name_fields = document.getElementsByClassName(
        "group-to-remove-from-user"
    );
    for (let field of group_name_fields) {
        field.innerText = group_name;
    }
    var user = document.getElementById("user-selection").value;

    showModal("rm-from-group-modal");

    var continue_rm_from_group = document.getElementById(
        "continue-rm-from-group-btn"
    );
    continue_rm_from_group.onclick = function () {
        rm_from_group(group_name, element_list);
    };
}

/* rm_from_group
 * Receives: nothing
 * Does: removes selected user from selected group by calling `gpasswd -d <user> <group>`
 * Returns: nothing
 */
function rm_from_group(group, element_list) {
    let groupNotification = new Notification("add-group");
    groupNotification.setSpinner();

    var user = document.getElementById("user-selection").value;
    var proc = cockpit.script(
        "gpasswd -d " + user + " " + group + " > /dev/null",
        { err: "out", superuser: "require" }
    );
    proc.done(function (data) {
        groupNotification.setSuccess("Successfully removed " + user + " from " + group + ".");
        element_list.forEach((elem) => elem.remove());
        set_curr_user_group_list();
    });
    proc.fail(function (ex, data) {
        groupNotification.setError(data);
    });
    hideModal("rm-from-group-modal");
}

/* check_passwords
 * Receives: nothing
 * Does: verifies that the passwords entered into smbpasswd modal dialog are valid
 * Returns: [false, ""] if invalid, [true, "<password>"] if valid
 */
function check_passwords() {
    let passwdNotification = new Notification("smbpasswd-modal")
    passwdNotification.clear_info();

    var pw1 = document.getElementById("smbpasswd-pw1").value;
    var pw2 = document.getElementById("smbpasswd-pw2").value;
    if (pw1.length == 0 || pw2.length == 0) {
        passwdNotification.setError("Password cannot be empty!");
        return [false, ""];
    }
    if (pw1 !== pw2) {
        passwdNotification.setError("Passwords do not match!");
        return [false, ""];
    }
    return [true, pw1];
}

/* set_smbpasswd
 * Receives: nothing
 * Does: calls check_passwords, if valid, set smbpasswd by calling `smbpasswd -s -a <user>` and
 * supplying new password via stdin
 * Returns: nothing
 */
function set_smbpasswd() {
    let passwdNotification = new Notification("smbpasswd-modal")
    passwdNotification.setSpinner();

    var user = document.getElementById("user-selection").value;
    const [res, passwd] = check_passwords();
    if (res === true) {
        var proc = cockpit.spawn(["smbpasswd", "-s", "-a", user], {
            err: "out",
            superuser: "required",
        });
        proc.input(passwd + "\n" + passwd + "\n");
        proc.done(function () {
            passwdNotification.clearInfo();
            passwdNotification.setSuccess("Successfully set Samba password for " + user + ".");
            hideModal("smbpasswd-modal")
        });
        proc.fail(function (ex, data) {
            var why = "";
            if (ex.problem === "not-found") why = "smbpasswd not found.";
            else why = data;
            passwdNotification.setError("Error setting samba password: " + why);
        });
    }
}

/* rm_smbpasswd
 * Receives: nothing
 * Does: removes selected user's samba password with `smbpasswd -x <user>`
 * Returns: nothing
 */
function rm_smbpasswd() {
    let passwdNotification = new Notification("smbpasswd");
    passwdNotification.setSpinner();

    var user = document.getElementById("user-selection").value;

    var proc = cockpit.script("smbpasswd -x " + user, {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        passwdNotification.setSuccess("Successfully removed Samba password for " + user + ".");
    });
    proc.fail(function (ex, data) {
        passwdNotification.setError(data);
    });
    hideModal("rm-smbpasswd-modal");
}

/* create_list_entry
 * Receives: list entry name as string, callback function to remove entry
 * Does: creates new element for list entry, with a text div for name and x button
 * for removal
 * Returns: created entry
 */
function create_list_entry(entry_name, on_delete) {
    var entry = document.createElement("div");
    entry.classList.add("highlight-entry");

    var name = document.createElement("div");
    name.innerText = entry_name;

    var spacer = document.createElement("div");
    var subspacer = document.createElement("div");
    subspacer.classList.add("horizontal-spacer");
    spacer.appendChild(subspacer);

    var del = document.createElement("div");
    del.classList.add("circle-icon", "circle-icon-danger");
    del.addEventListener("click", function () {
        on_delete(entry_name, [del, subspacer, spacer, name, entry]);
    });

    entry.appendChild(name);
    entry.appendChild(spacer);
    entry.appendChild(del);
    return entry;
}

/* create_list_entry_selection
 * Receives: list entry name as string, callback function to remove entry
 * Does: creates new element for list entry, with a text div for name and selection button
 * to select groups to add to user's groups. can select and deselect buttons.
 * Returns: created entry
 */
function create_list_entry_selection(entry_name) {
    var entry = document.createElement("div");
    entry.classList.add("highlight-entry");

    var name = document.createElement("div");
    name.innerText = entry_name;

    var spacer = document.createElement("div");
    var subspacer = document.createElement("div");
    subspacer.classList.add("horizontal-spacer");
    spacer.appendChild(subspacer);

    var sel = document.createElement("input");
    sel.classList.add("ct-input");
    sel.classList.add("checkmark");
    sel.setAttribute("id", entry_name);
    sel.setAttribute("type", "checkbox");
    sel.addEventListener("click", function () {
        if (document.getElementById(entry_name).checked == true) {
            selections.push(entry_name);
        } else {
            selections = selections.filter(function (item) {
                return item !== entry_name;
            });
        }
    });

    entry.appendChild(name);
    entry.appendChild(spacer);
    entry.appendChild(sel);
    return entry;
}

/* create_group_list_entry
 * Receives: name of group as string
 * Does: calls create_list_entry with group_name as the name and
 * show_rm_group_dialog as the callback, and adds classes to have the entry span
 * the entire width of the list
 * Returns: the list entry element
 */
function create_group_list_entry(group_name) {
    var entry = create_list_entry(group_name, show_rm_group_dialog);
    entry.classList.add("row-45d", "flex-45d-space-between", "flex-45d-center");
    return entry;
}

/* create_group_list_entry_for_selection
 * Receives: name of group as string
 * Does: calls create_list_entry_selection with group_name as the
 * name and adds classes to have the entry span
 * the entire width of the list
 * Returns: the list entry element
 */
function create_group_list_entry_for_selection(group_name) {
    var entry = create_list_entry_selection(group_name);
    entry.classList.add("row-45d", "flex-45d-space-between", "flex-45d-center");
    return entry;
}

/* create_user_group_list_entry
 * Receives: name of group user is apart of as string
 * Does: calls create_list_entry with group_name as the name and
 * show_rm_from_group_dialog as the callback, and adds classes to have the entry span
 * the entire width of the list
 * Returns: the list entry element
 */
function create_user_group_list_entry(group_name) {
    var entry = create_list_entry(group_name, show_rm_from_group_dialog);
    entry.classList.add("row-45d", "flex-45d-space-between", "flex-45d-center");
    return entry;
}

/* show_rm_group_dialog
 * Receives: nothing
 * Does: shows modal show_rm_group_dialog
 * Returns: nothing
 */
function show_rm_group_dialog(group_name, element_list) {
    var group_name_fields = document.getElementsByClassName("group-to-remove");
    for (let field of group_name_fields) {
        field.innerText = group_name;
    }

    showModal("rm-group-modal");

    var continue_rm_group = document.getElementById("continue-rm-group");
    continue_rm_group.onclick = function () {
        rm_group(group_name, element_list);
    };
}

/* rm_group
 * Receives: name of group to remove, list of elements to delete from DOM
 * Does: calls `groupdel <group_name>` to remove group from system, and on success,
 * removes element from list
 * Returns: nothing
 */
function rm_group(group_name, element_list) {
    let groupNotification = new Notification("group");
    groupNotification.setSpinner();

    var proc = cockpit.spawn(["groupdel", group_name], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        groupNotification.setSuccess("Successfully deleted " + group_name + ".");
        element_list.forEach((elem) => elem.remove());
        add_group_options();
        set_curr_user_group_list();
    });
    proc.fail(function (ex, data) {
        groupNotification.setError(data);
    });
    hideModal("rm-group-modal");
}

/* add_group
 * Receives: nothing
 * Does: creates group with name supplied in modal dialog by calling `groupadd <group_name>`
 * Returns: nothing
 */
function add_group() {
    let groupNotification = new Notification("add-group-modal");

    var group_name = document.getElementById("new-group-name").value;
    if (check_group_name()) {
        groupNotification.setSpinner();
        var proc = cockpit.spawn(["groupadd", group_name], {
            err: "out",
            superuser: "require",
        });
        proc.done(function (data) {
            hideModal("add-group-modal");
            add_group_options();
            groupNotification.clearInfo();
            groupNotification.setSuccess("Successfully added " + group_name);
        });
        proc.fail(function (ex, data) {
            groupNotification.setError(data);
        });
    }
}

/* check_group_name
 * Receives: nothing
 * Does: checks if supplied group name is valid, if invalid, continue button is disabled
 * Returns: true if valid, false if invalid
 *
 * Validity check is based on libmisc/chkname.c from the source code of shadow (https://github.com/shadow-maint/shadow)
 */
function check_group_name() {
    var group_name = document.getElementById("new-group-name").value;
    var button = document.getElementById("continue-add-group");
    var info_message = document.getElementById("add-group-modal-feedback");
    info_message.innerText = " ";
    if (group_name.length === 0) {
        button.disabled = true;
        info_message.innerText = "Group name is empty.";
        return false;
    } else if (!group_name.match(/^[a-z_][a-z0-9_-]*[$]?$/)) {
        button.disabled = true;
        var invalid_chars = [];
        if (group_name[0].match(/[^a-z_]/))
            invalid_chars.push("'" + group_name[0] + "'");
        for (let char of group_name.slice(1, -1))
            if (char.match(/[^a-z0-9_-]/)) invalid_chars.push("'" + char + "'");
        if (group_name[group_name.length - 1].match(/[^a-z0-9_\-$]/))
            invalid_chars.push("'" + group_name[group_name.length - 1] + "'");
        info_message.innerText =
            "Group name contains invalid characters: " +
            invalid_chars.join(", ");
        return false;
    }
    button.disabled = false;
    return true;
}

/* parse_shares
 * Receives: output of `net conf list` as array of strings, split at newlines
 * Does: parses each line of `net conf list` to get global settings in the global_samba_conf object,
 * and each of the share's settings in its own object in the shares object
 * Returns: [shares object, global_samba_conf object]
 */
function parse_shares(lines) {
    var shares = {};
    var glob = {};
    var section = "";
    for (let line of lines) {
        line = line.trim();
        if (line.length === 0 || line[0] === "#") continue;
        var section_match = line.match(/^\[([^\]]+)\]$/);
        if (section_match) {
            section = section_match[1].trim();
            if (!section.match(/^[Gg]lobal$/)) shares[section] = {};
            continue;
        }
        var option_match = line.match(/^([^=]+)=(.*)$/);
        if (option_match) {
            let key = option_match[1].toLowerCase().trim().replace(/\s+/g, "-");
            let value = option_match[2].trim();
            if (section.match(/^[Gg]lobal$/)) glob[key] = value;
            else shares[section][key] = value;
            continue;
        }
        console.log("Unknown smb entry: " + line);
    }
    return [shares, glob];
}

/* create_share_list_entry
 * Receives: name of share as a string, share path, and callback function to delete share on click
 * Does: creates list entries for a table tag
 * Returns: entry element
 */
function create_share_list_entry(share_name, path, on_delete) {
    var entry = document.createElement("tr");
    entry.classList.add("highlight-entry");

    var entry_name = document.createElement("td");
    entry_name.innerText = share_name;

    var entry_path = document.createElement("td");
    entry_path.innerText = path;

    var del = document.createElement("td");
    del.style.padding = "2px"
    del.style.textAlign = "right"
    var del_div = document.createElement("span");
    del_div.classList.add("circle-icon", "circle-icon-danger");
    del_div.addEventListener("click", function () {
        on_delete(share_name, [del_div, del, entry_path, entry_name, entry]);
    });
    del.appendChild(del_div);

    entry.appendChild(entry_name);
    entry.appendChild(entry_path);
    entry.appendChild(del);

    return entry;
}

/* populate_share_list
 * Receives: nothing
 * Does: clears list of shares, repopulates list based on returned object from parse_shares
 * Returns: promise
 */
async function populate_share_list() {
    var shares_list = document.getElementById("shares-list");

    shares_list.innerHTML = ""
    
    try {
        var data = await run_command(["net", "conf", "list"]);
        const [shares, glob] = parse_shares(data.split("\n"));
        if (Object.keys(shares).length === 0) {
            var msg = document.createElement("tr");
            var name = document.createElement("td");
            name.innerText = 'No shares. Click the "plus" to add one.';
            var path = document.createElement("td");
            var del = document.createElement("td");
            msg.appendChild(name)
            msg.appendChild(path)
            msg.appendChild(del)
            shares_list.appendChild(msg);
        } else {
            Object.keys(shares).forEach(function (share_name) {
                var item = create_share_list_entry(
                    share_name,
                    shares[share_name].path,
                    show_rm_share_dialog
                );
                item.firstChild.onclick = function () {
                    show_share_dialog("edit", share_name, shares[share_name]);
                };
                item.firstChild.classList.add("clickable");
                shares_list.appendChild(item);
            });
        }
        for (let key of Object.keys(glob)) {
            global_samba_conf[key] = glob[key];
        }
    }
    catch (err) {
        let shareNotification = new Notification("share");
        shareNotification.setError(err);
    }
}

// Run Command will spawn a command and return a promise
function run_command(args) {
    return new Promise((resolve,reject) => {
        let proc = cockpit.spawn(args, {
            err: "out",
            superuser: "require",
        })
        proc.done((data) => {
            resolve(data)
        })
        proc.fail((err, data) => {
            reject(data)
        })
    })
}

/* show_share_dialog
 * Receives: string containing "create" or "edit", name of share being modified,
 * object containing share settings
 * Does: shows share modal dialog and sets up buttons in modal dialog
 * Returns: nothing
 */
function show_share_dialog(create_or_edit, share_name = "", share_settings = {}) {
    var old_path = "";
    let shareNotification = new Notification("share-modal");
    var func = document.getElementById("share-modal-function");
    var button = document.getElementById("continue-share");
    var text_area = document.getElementById("advanced-global-settings-input");

    text_area.style.height = "";
    text_area.style.height = Math.max(text_area.scrollHeight + 5, 50) + "px";
    if (create_or_edit === "create") {
        func.innerText = "Add New";
        button.onclick = function () {
            var path = document.getElementById("path").value;

            if (path == old_path) {
                var proc = cockpit.spawn(["mkdir", path], {
                    err: "out",
                    superuser: "require",
                });
                proc.done(function (data) {
                    console.log("Directory " + path + " made");
                    add_share();
                });
                proc.fail(function (ex, data) {
                    shareNotification.setError(data);
                });
            } else {
                var proc = cockpit.spawn(["stat", path], {
                    err: "out",
                    superuser: "require",
                });
                proc.done(function (data) {
                    add_share();
                });
                proc.fail(function (ex, data) {
                    old_path = path;
                    shareNotification.setError(path + ' does not exist. Press "Add Share" again to create the directory.');
                });
            }
        };
        button.innerText = "Add Share";
        document.getElementById("share-name").disabled = false;
        set_share_defaults();

    } else if (create_or_edit === "edit") {
        document.getElementById("share-name").value = share_name;
        func.innerText = "Edit";
        button.onclick = function () {
            var path = document.getElementById("path").value;

            if (path == old_path) {
                var proc = cockpit.spawn(["mkdir", path], {
                    err: "out",
                    superuser: "try",
                });
                proc.done(function (data) {
                    console.log("Directory " + path + " made");
                    edit_share(share_name, share_settings, "updated");
                });
                proc.fail(function (ex, data) {
                    shareNotification.setError(data);
                });
            } else {
                var proc = cockpit.spawn(["stat", path], {
                    err: "out",
                    superuser: "try",
                });
                proc.done(function (data) {
                    edit_share(share_name, share_settings, "updated");
                });
                proc.fail(function (ex, data) {
                    old_path = path;
                    shareNotification.setError(path + ' does not exist. Press "Apply" again to create the directory.');
                });
            }
        };
        button.innerText = "Apply";
        document.getElementById("share-name").disabled = true;
        populate_share_settings(share_settings);
    }
    var add_user_select = document.getElementById("add-user-to-share");
    add_user_select.addEventListener("change", (event) => {
        if (event.target.value !== "") add_user_to_share(event.target.value);
    });
    var add_group_select = document.getElementById("add-group-to-share");
    add_group_select.addEventListener("change", (event) => {
        if (event.target.value !== "") add_group_to_share(event.target.value);
    });
    
    showModal("share-modal");
}

/* set_share_defaults
 * Receives: nothing
 * Does: fills in all fields in share dialog with default values for adding new share
 * Returns: nothing
 */
function set_share_defaults() {
    document.getElementById("share-name").value = "";
    document.getElementById("share-name-feedback").innerText = "";
    document.getElementById("comment").value = "";
    document.getElementById("path").value = "";
    document.getElementById("windows-acls").checked = false;
    document.getElementById("add-user-to-share").disabled = false;
    document.getElementById("add-group-to-share").disabled = false;
    document.getElementById("share-path-feedback").innerText = "";
    share_valid_groups.clear();
    share_valid_users.clear();
    update_users_in_share();
    update_groups_in_share();
    document.getElementById("guest-ok").checked = false;
    document.getElementById("read-only").checked = false;
    document.getElementById("browseable").checked = true;
    var input = document.getElementById("advanced-share-settings-input");
    input.value = "";
    input.style.height = "";
    input.style.height = Math.max(input.scrollHeight + 5, 50) + "px";
    document.getElementById("continue-share").disabled = false;
}

/* add_share
 * Receives: nothing
 * Does: checks share settings with verify_share_settings(), if valid, calls
 * `net conf addshare <share name> <share path>`
 * Returns: nothing
 */
function add_share() {
    if (!verify_share_settings()) return;

    let shareNotification = new Notification("share-modal");
    shareNotification.setSpinner();

    var name = document.getElementById("share-name").value;
    var path = document.getElementById("path").value;
    var proc = cockpit.spawn(["net", "conf", "addshare", name, path], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        edit_share(name, {}, "created");
    });
    proc.fail(function (ex, data) {
        shareNotification.setError(data);
    });
}

// object to store settings before changes to figure out which options were removed
var advanced_share_settings_before_change = {};

/* populate_share_settings
 * Receives: settings object returned from parse_shares
 * Does: populates share setting fields with current settings, placing extra parameters in
 * the advanced settings textarea
 * Returns: nothing
 */
function populate_share_settings(settings) {
    var params = document.getElementsByClassName("share-param");
    var advanced_settings = { ...settings };
    share_valid_groups.clear();
    share_valid_users.clear();
    update_users_in_share();
    update_groups_in_share();
    for (let param of params) {
        delete advanced_settings[param.id];
        var value = settings[param.id];
        if (value === "yes") param.checked = true;
        else if (value === "no") param.checked = false;
        else param.value = value;
    }
    var is_windows_acl = true;
    for (let param of Object.keys(windows_acl_parms)) {
        if (Object.hasOwnProperty.call(advanced_settings, param)) {
            delete advanced_settings[param];
        }
        else {
            is_windows_acl = false;
        }
    }
    if (is_windows_acl) {
        document.getElementById("windows-acls").setAttribute("checked", true);
        advanced_settings["vfs-objects"] = advanced_settings["vfs-objects"].replace("acl_xattr", "")
        if (advanced_settings["vfs-objects"] == "") {
            delete advanced_settings["vfs-objects"]
        }
    }
    advanced_share_settings_before_change = { ...advanced_settings };
    var advanced_settings_list = [];
    for (let key of Object.keys(advanced_settings)) {
        advanced_settings_list.push(
            key.replace(/-/, " ") + " = " + advanced_settings[key]
        );
    }
    document.getElementById("advanced-share-settings-input").value =
        advanced_settings_list.join("\n");
    if (settings["valid-users"]) {
        var users_and_groups = settings["valid-users"].split(", ");
        for (let user_or_group of users_and_groups) {
            if (user_or_group[0] === "@") {
                add_group_to_share(user_or_group.slice(1));
            } else {
                add_user_to_share(user_or_group);
            }
        }
    }
    verify_share_settings();
}

// Sets to hold users and groups in currently edited share
var share_valid_users = new Set();
var share_valid_groups = new Set();

/* add_user_to_share
 * Receives: user name as string
 * Does: adds user string to global user Set, updates displayed list of users in share
 * Returns: nothing
 */
function add_user_to_share(user) {
    share_valid_users.add(user);
    update_users_in_share();
}

/* remove_user_from_share
 * Receives: user name as string
 * Does: deletes user string from global user Set, updates displayed list of users in share
 * Returns: nothing
 */
function remove_user_from_share(user) {
    share_valid_users.delete(user);
    update_users_in_share();
}

/* create_valid_user_list_entry
 * Receives: user name string, callback function to remove user from share
 * Does: creates list entry and appends class for valid user/group list CSS styling
 * Returns: entry element
 */
function create_valid_user_list_entry(user, on_delete) {
    var entry = create_list_entry(user, on_delete);
    entry.classList.add("valid-user-list-entry");
    return entry;
}

/* update_users_in_share
 * Receives: nothing
 * Does: clears users in share list, repopulates based on contents of global valid user Set,
 * calls update_in_share to reconstruct the span text to be used as "valid users" parameter value
 * Returns: nothing
 */
function update_users_in_share() {
    var in_share = document.getElementById("selected-users");
    var select = document.getElementById("add-user-to-share");
    select.childNodes[0].selected = true;
    while (in_share.firstChild) {
        in_share.removeChild(in_share.firstChild);
    }
    for (let user of share_valid_users) {
        var entry = create_valid_user_list_entry(user, function () {
            remove_user_from_share(user);
        });
        in_share.appendChild(entry);
    }
    update_in_share();
}

/* add_group_to_share
 * Receives: group name as string
 * Does: adds group string to global group Set, updates displayed list of groups in share
 * Returns: nothing
 */
function add_group_to_share(group) {
    share_valid_groups.add(group);
    update_groups_in_share();
}

/* remove_group_from_share
 * Receives: group name as string
 * Does: deletes group string from global user Set, updates displayed list of groups in share
 * Returns: nothing
 */
function remove_group_from_share(group) {
    share_valid_groups.delete(group);
    update_groups_in_share();
}

/* update_groups_in_share
 * Receives: nothing
 * Does: clears groups in group list, repopulates based on contents of global valid group Set,
 * calls update_in_share to reconstruct the span text to be used as "valid users" parameter value
 * Returns: nothing
 */
function update_groups_in_share() {
    var in_share = document.getElementById("selected-groups");
    var select = document.getElementById("add-group-to-share");
    select.childNodes[0].selected = true;
    while (in_share.firstChild) {
        in_share.removeChild(in_share.firstChild);
    }
    for (let group of share_valid_groups) {
        var entry = create_valid_user_list_entry(group, function () {
            remove_group_from_share(group);
        });
        in_share.appendChild(entry);
    }
    update_in_share();
}

/* update_in_share
 * Receives: nothing
 * Does: sets value of valid-users DOM element to string of valid users and groups from the global Sets
 * Returns: nothing
 */
function update_in_share() {
    var valid_users = document.getElementById("valid-users");
    var group_names = [...share_valid_groups];
    for (let i = 0; i < group_names.length; i++) {
        group_names[i] = "@" + group_names[i];
    }
    valid_users.value = valid_users.innerText = [
        ...share_valid_users,
        ...group_names,
    ]
        .sort()
        .join(", ");
}

/* get_extra_params
 * Receives: string containing "share" or "global"
 * Does: parses either the share or global advanced settings textarea based on share_or_global and object of
 * param key to param value
 * Returns: object of advanced parameters
 */
function get_extra_params(share_or_global) {
    var params = {};
    var advanced_settings_arr = document
        .getElementById("advanced-" + share_or_global + "-settings-input")
        .value.split("\n");
    for (let param of advanced_settings_arr) {
        if (param.trim() === "" || !param.includes("=")) continue;
        var split = param.split("=");
        var key = split[0].trim().replace(/\s+/g, "-");
        var val = split[1].trim();
        params[key] = val;
    }
    return params;
}

/* verify_share_settings
 * Receives: nothing
 * Does: checks share name and path, if both are valid, continue button is undisabled
 * Returns: true if name and path are valid, false otherwise
 */
function verify_share_settings() {
    var name_res = verify_share_name();
    var path_res = verify_share_path();
    if (name_res && path_res) {
        document.getElementById("continue-share").disabled = false;
        return true;
    }
    return false;
}

/* verify_share_name
 * Receives: nothing
 * Does: verifies share name, disabling continue button if invalid, and reporting disallowed
 * characters to user
 * Returns: true if valid, false otherwise
 */
function verify_share_name() {
    var share_name = document.getElementById("share-name").value;
    var feedback = document.getElementById("share-name-feedback");
    var button = document.getElementById("continue-share");
    feedback.innerText = "";
    var disallowed_names = ["ADMIN$", "IPC$", "c$"];
    if (share_name === "") {
        button.disabled = true;
        feedback.innerText = "Share name is empty.";
        return false;
    }
    if (share_name in disallowed_names) {
        button.disabled = true;
        feedback.innerText = share_name + " is a reserved name.";
        return false;
    }
    if (!share_name.match(/^[^\s+\[\]"/\:;|<>,?*=][^+\[\]"/\:;|<>,?*=]*$/)) {
        button.disabled = true;
        var invalid_chars = [];
        if (share_name[0].match(/[\s+\[\]"/\:;|<>,?*=]/))
            invalid_chars.push("'" + share_name[0] + "'");
        for (let char of share_name.slice(1))
            if (char.match(/[+\[\]"/\:;|<>,?*=]/))
                invalid_chars.push("'" + char + "'");
        feedback.innerText =
            "Share name contains invalid characters: " +
            invalid_chars.join(", ");
        return false;
    }
    return true;
}

/* verify_share_path
 * Receives: nothing
 * Does: verifies that the share path is not empty and is absolute, disabling continue
 * button if invalid
 * Returns: true if valid, false otherwise
 */
function verify_share_path() {
    var path = document.getElementById("path").value;
    var feedback = document.getElementById("share-path-feedback");
    var button = document.getElementById("continue-share");
    feedback.innerText = "";
    if (path === "") {
        button.disabled = true;
        feedback.innerText = "Path is empty.";
        return false;
    }
    if (path[0] !== "/") {
        button.disabled = true;
        feedback.innerText = "Path must be absolute.";
        return false;
    }
    return true;
}

/* edit_share
 * Receives: name of share as string, object containing old share settings, string
 * containing "created" or "updated"
 * Does: checks settings with verify_share_settings, if valid, updates settings object with new settings,
 * stores newly changed settings in separate object, appends extra parameters from advanced config, and
 * calls edit_parms to apply changed settings
 * Returns: nothing
 */
function edit_share(share_name, settings, action) {
    /* Params have DOM id the same as net conf setparm <param>
     */
    if (!verify_share_settings()) return;

    let shareNotification = new Notification("share-modal");
    shareNotification.setSpinner();

    var params = document.getElementsByClassName("share-param");
    var changed_settings = {};
    for (let param of params) {
        var value = "";
        if (param.type === "checkbox")
            if (param.checked) value = "yes";
            else value = "no";
        else value = param.value;
        if (settings[param.id] !== value) changed_settings[param.id] = value;
        settings[param.id] = value;
    }
    var extra_params = get_extra_params("share");
    for (let key of Object.keys(extra_params)) {
        changed_settings[key] = extra_params[key];
    }
    var params_to_delete = new Set(
        Object.keys(advanced_share_settings_before_change)
    );
    for (let param of params_to_delete) {
        if (param in extra_params) params_to_delete.delete(param);
    }

    if (document.getElementById("windows-acls").checked) {
        changed_settings = Object.assign(changed_settings, windows_acl_parms)
        if (!!changed_settings["vfs-objects"]) {
            changed_settings["vfs-objects"] = changed_settings["vfs-objects"] + " acl_xattr";
        } else {
            changed_settings["vfs-objects"] = "acl_xattr"
        }
    }
    else {
        var temp_acl_parms = Object.keys(windows_acl_parms)
        temp_acl_parms.push(... params_to_delete.values())
        params_to_delete = temp_acl_parms

        if (!changed_settings["vfs-objects"]) {
            params_to_delete.push("vfs-objects")
        }
    }

    edit_parms(
        share_name,
        changed_settings,
        params_to_delete,
        action,
        function() {
            hideModal("share-modal");
        },
        "share-modal"
    );

    
}

/* edit_parms
 * Receives: name of share to edit, changed parameters, removed advanced paramters, string with "created" or "updated",
 * callback function to hide modal dialog, id string for info message
 * Does: constructs payload object containing parameters to delete to pass to del_parms.py as JSON, and on success,
 * calls set_parms with paramters to add/change. If editing global, domain range is reset.
 * Returns: nothing
 */
async function edit_parms(
    share_name,
    params_to_set,
    params_to_delete,
    action,
    hide_modal_func,
    info_id
) {
    // delete parms first
    await del_parms(
        share_name,
        params_to_delete,
        action,
        hide_modal_func,
        info_id
    );
    await set_parms(
        share_name,
        params_to_set,
        action,
        hide_modal_func,
        info_id
    );
    if (/global/i.test(share_name)) {
        domain_lower_limit = undefined;
        await get_global_conf();
        // await populate_share_list();
        get_domain_range();
        add_group_options();
        add_user_options();
    }
}

/* del_parms
 * Receives: name of share to edit, removed advanced paramters, string with "created" or "updated",
 * callback function to hide modal dialog, id string for info message
 * Does: constructs payload object containing parameters to delete to pass to del_parms.py as JSON
 * Returns: promise
 */
function del_parms(share_name, params_to_delete, action, hide_modal_func, info_id) {
    let notification = new Notification(info_id);
    let shareNotification = new Notification("share");
 
    // delete parms first
    var payload = {};
    payload["section"] = share_name;
    payload["parms"] = [...params_to_delete];
    var proc = cockpit.spawn(
        ["/usr/share/cockpit/file-sharing/samba-manager/scripts/del_parms.py"],
        {
            err: "out",
            superuser: "require",
        }
    );
    proc.input(JSON.stringify(payload));
    proc.done(function (data) {
        notification.clearInfo();
        shareNotification.setSuccess("Successfully " + action + " " + share_name + ".");
    });
    proc.fail(function (ex, data) {
        shareNotification.setError(data);
    });
    return proc;
}

/* set_parms
 * Receives: name of share to edit, new/changed parameters, string with "created" or "updated",
 * callback function to hide modal dialog, id string for info message
 * Does: constructs payload object containing parameters to add/change to pass to set_parms.py as JSON
 * Returns: promise
 */
function set_parms(share_name, params, action, hide_modal_func, info_id) {
    let notification = new Notification(info_id);
    let shareNotification = new Notification("share");
    
    var payload = {};
    payload["section"] = share_name;
    payload["parms"] = params;
    var proc = cockpit.spawn(
        ["/usr/share/cockpit/file-sharing/samba-manager/scripts/set_parms.py"],
        {
            err: "out",
            superuser: "require",
        }
    );
    proc.input(JSON.stringify(payload));
    proc.done(function (data) {
        notification.clearInfo();
        shareNotification.setSuccess("Successfully " + action + " " + share_name + ".");
        populate_share_list();
        hide_modal_func();
    });
    proc.fail(function (ex, data) {
        notification.setError(data);
    });
    return proc;
}

/* toggle_advanced_share_settings
 * Receives: nothing
 * Does: shows/hides dropdown drawer containing textarea for advanced share settings,
 * spins dropdown triangle icon
 * Returns: nothing
 */
function toggle_advanced_share_settings() {
    var drawer = document.getElementById("advanced-share-settings-drawer");
    var arrow = document.getElementById("advanced-share-settings-arrow");
    drawer.hidden = !drawer.hidden;
    if (arrow.style.transform !== "rotate(180deg)")
        arrow.style.transform = "rotate(180deg)";
    else arrow.style.transform = "";
}

/* check_shadow_copy
 * Receives: nothing
 * Does: Checks if path chosen is ceph cluster or not. populates accordingly
 * Returns: nothing
 */
function check_shadow_copy() {
    var path = document.getElementById("path").value;
    var notCephfs = "shadow: snapdir = .zfs/snapshot\nshadow: sort = desc\nshadow: format = %Y-%m-%d-%H%M%S";

    var proc = cockpit.spawn(["getfattr", "-n", "ceph.dir.entries", path], {err:"ignore"});
    proc.done(function() {
        populate_advanced_share_settings("shadowcopy", "ceph_snapshosts", "", "ceph_snapshosts");
    });
    proc.fail(function() {
        populate_advanced_share_settings("shadowcopy", "shadow:", notCephfs, "shadow_copy2");
    });
}

/* find_vfs_object
 * Receives: vfs_object
 * Does: Checks to see if vfs objects is already in the string. If so, add vfs_object to it
 * Returns: string
 */
function find_vfs_object(input, vfs_object) {
    if(input.value.includes("vfs objects")) {
        var lines = input.value.split('\n');
        for(var line in lines) {
            if(lines[line].includes("vfs object")) {
                lines[line] += " " + vfs_object
                return lines.join("\n")
            }
        }
    } else {
        return "vfs objects = " + vfs_object;
    }
}

/* windows_acl
 * Receives: Nothing
 * Does: Populates advanced settings with windows_acl settings if checked.
 * Returns: nothing
 */
function windows_acl() {
    var user = document.getElementById("add-user-to-share");
    var group = document.getElementById("add-group-to-share");
    var users_selected = document.getElementById("selected-users");
    var groups_selected = document.getElementById("selected-groups")

    if(document.getElementById("windows-acls").checked == true) {
        user.disabled = true;
        group.disabled = true;

        while (users_selected.firstChild) {
            users_selected.removeChild(users_selected.firstChild);
            
        }
        while (groups_selected.firstChild) {
            groups_selected.removeChild(groups_selected.firstChild);
        }

        share_valid_users.clear();
        share_valid_groups.clear();

        update_users_in_share();
    }
    else {
        user.disabled = false;
        group.disabled = false;
    }
}

/* check_dir
 * Receives: Path
 * Does: Runs ls.py command to get list of directories form path.
 * Returns: nothing
 */
async function check_dir(path) {
    children = [];
	var proc = cockpit.spawn(
		["/usr/share/cockpit/file-sharing/samba-manager/scripts/ls.py", path],
		{err:"out", superuser: "try"}
	);
	proc.fail((e, data) => {
		return [];
	});
	var data = await proc;
	var response = JSON.parse(data);
	this.stat = response["."]["stat"];
	var entries = response["children"];
	entries.forEach((entry) => {
		if(entry["isdir"])
			children.push(entry["filename"]);
	});
	return children;
}

/* nav_bar_update_choices
 * Receives: Nothing
 * Does: Populates input list with choices of paths to choose from.
 * Returns: nothing
 */
async function nav_bar_update_choices() {
    var list = document.getElementById("possible-paths");
	var partial_path_str = document.getElementById("path").value;
	var last_delim = partial_path_str.lastIndexOf('/');
    var old_path = document.getElementById("old-path");
	if(last_delim === -1)
		return;
	var parent_path_str = partial_path_str.slice(0, last_delim);
	if(old_path.value === parent_path_str)
		return;
	old_path.value = parent_path_str;
    var error = false;
	var objs = await check_dir(parent_path_str).catch(() => {error = true});
    if(error)
        return;
	while(list.firstChild)
		list.removeChild(list.firstChild);
	objs.forEach((obj) => {
		var option = document.createElement("option");
		option.value = parent_path_str + "/" + obj
		list.appendChild(option);
	});
}

/* populate_advanced_share_settings
 * Receives: id, string_to_check, string, and vfs_object
 * Does: Populates advanced share settings depending on the id and string_to_check with string received
 * Returns: nothing
 */
function populate_advanced_share_settings(id, string_to_check, string, vfs_object) {
    var input = document.getElementById("advanced-share-settings-input");
    var pressed = document.getElementById("is-pressed-" + id);

    if(input.value.includes(string_to_check)) {
        if(pressed.innerText.includes("true")) {
            input.value = "vfs objects = " + vfs_object + "\n\n" + string;
            pressed.innerText = false;
            input.style.height = "";
            input.style.height = Math.max(input.scrollHeight + 5, 50) + "px";
        }
        else {
            set_error("share-modal", "Parameters already contain " + id + " settings. Press again to clear all parameters and populate with JUST " + id + " settings.", timeout_ms);
            pressed.innerText = true;
            setTimeout(function(){
                pressed.innerText = false;
            }, timeout_ms + 1000);
        }
    }
    else {
        input.value = find_vfs_object(input, vfs_object) + "\n\n" + string;
        input.style.height = "";
        input.style.height = Math.max(input.scrollHeight + 5, 50) + "px";
    }
}


/* show_rm_share_dialog
 * Receives: name of share as string, list of elements to delete
 * Does: shows modal dialog to confirm removal of share, populates name fields with
 * passed share name, sets continue button's onclick to be rm_share with share name and
 * element list as arguments
 * Returns: nothing
 */
function show_rm_share_dialog(share_name, element_list) {
    var share_name_fields = document.getElementsByClassName("share-to-remove");
    for (let field of share_name_fields) {
        field.innerText = share_name;
    }
    showModal("rm-share-modal");
    var continue_rm_share = document.getElementById("continue-rm-share");
    continue_rm_share.onclick = function () {
        rm_share(share_name, element_list);
    };
}

/* rm_share
 * Receives: name of share to remove as string, list of elements to delete to remove list entry
 * Does: calls `net conf delshare <share_name>` to delete share, and on success, share list element is removed
 * and dialog is hidden
 * Returns: nothing
 */
function rm_share(share_name, element_list) {
    let shareNotification = new Notification("share");
    shareNotification.setSpinner("");

    var proc = cockpit.spawn(["net", "conf", "delshare", share_name], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        populate_share_list();
        shareNotification.setSuccess("Successfully deleted " + share_name + ".");
        element_list.forEach((elem) => elem.remove());
    });
    proc.fail(function (ex, data) {
        shareNotification.setError(data);
    });
    hideModal("rm-share-modal");
}

/* show_samba_global_dialog
 * Receives: nothing
 * Does: calls populate_samba_global to populate global setting fields and shows global settings modal dialog
 * Returns: nothing
 */
function show_samba_global_dialog() {
    populate_samba_global();
    var text_area = document.getElementById("advanced-global-settings-input");
    text_area.style.height = "";
    text_area.style.height = Math.max(text_area.scrollHeight + 5, 50) + "px";
    
    showModal("samba-global-modal");

    let sambaNotification = new Notification("samba-global-moda");
    sambaNotification.clearInfo();
}

/* toggle_advanced_global_settings
 * Receives: nothing
 * Does: shows/hides dropdown drawer containing textarea for advanced global settings,
 * spins dropdown triangle icon
 * Returns: nothing
 */
function toggle_advanced_global_settings() {
    var drawer = document.getElementById("advanced-global-settings-drawer");
    var arrow = document.getElementById("advanced-global-settings-arrow");
    drawer.hidden = !drawer.hidden;
    if (arrow.style.transform !== "rotate(180deg)")
        arrow.style.transform = "rotate(180deg)";
    else arrow.style.transform = "";
}

// objects to store settings before changes to figure out which options were removed
var global_settings_before_change = {};
var advanced_global_settings_before_change = {};

/* populate_samba_global
 * Receives: nothing
 * Does: calls `net conf list` and uses returned global settings object to populate parameter fields
 * and advanced settings textarea in global settings dialog
 * Returns: nothing
 */
function populate_samba_global() {
    var proc = cockpit.spawn(["net", "conf", "list"], {
        err: "out",
        superuser: "require",
    });
    proc.done(function (data) {
        const [shares, glob] = parse_shares(data.split("\n"));
        var advanced_settings = { ...glob };
        global_settings_before_change = {};
        var global_params = document.getElementsByClassName("global-param");
        for (let param of global_params) {
            if (param.id in glob) {
                var value = glob[param.id];
                if (param.id === "log-level") {
                    var val = Number(value);
                    if (isNaN(val)) {
                        param.disabled = true;
                        param.value = "1";
                    } else {
                        param.disabled = false;
                        delete advanced_settings[param.id];
                        param.value = val;
                        global_settings_before_change[param.id] = value;
                    }
                } else {
                    delete advanced_settings[param.id];
                    if (value === "yes") param.checked = true;
                    else if (value === "no") param.checked = false;
                    else param.value = value;
                    global_settings_before_change[param.id] = value;
                }
            }
        }
        advanced_global_settings_before_change = { ...advanced_settings };
        var advanced_settings_list = [];
        for (let key of Object.keys(advanced_settings)) {
            advanced_settings_list.push(
                key.replace(/-/g, " ") + " = " + advanced_settings[key]
            );
        }
        document.getElementById("advanced-global-settings-input").value =
            advanced_settings_list.join("\n");
    });
    proc.fail(function (ex, data) {
        let shareNotification = new Notification("share");
        shareNotification.setError(data);
    });
}

/* check_enable_log_level_dropdown
 * Receives: nothing
 * Does: enables or disables log level dropdown selector based on if log level is overridden in advanced global settings
 *
 */
function check_enable_log_level_dropdown() {
    var advanced_input_text = document.getElementById(
        "advanced-global-settings-input"
    ).value;
    var log_level_select = document.getElementById("log-level");
    log_level_select.disabled = /log\s*level\s*=/i.test(advanced_input_text);
}

/* edit_samba_global
 * Receives: nothing
 * Does: iterates through list of elements in class global-param, storing elem.value in object with elem.id as key, appends
 * extra params from advanced settings textarea, and passes objects of settings to edit_parms with section name as "global"
 * to apply changes
 * Returns: nothing
 */
async function edit_samba_global() {
    let sambaNotification = new Notification("samba-global-modal");
    sambaNotification.setSpinner();

    var params = document.getElementsByClassName("global-param");
    var changed_settings = {};
    for (let param of params) {
        var value = "";
        if (param.type === "checkbox")
            if (param.checked) value = "yes";
            else value = "no";
        else value = param.value;
        if (global_settings_before_change[param.id] !== value)
            changed_settings[param.id] = value;
        global_settings_before_change[param.id] = value;
    }
    var extra_params = get_extra_params("global");
    for (let key of Object.keys(extra_params)) {
        changed_settings[key] = extra_params[key];
    }
    var params_to_delete = new Set(
        Object.keys(advanced_global_settings_before_change)
    );
    for (let param of params_to_delete) {
        if (param in extra_params) params_to_delete.delete(param);
    }
    await edit_parms("global", changed_settings, params_to_delete, "updated", () => {hideModal("samba-global-modal")}, "samba-global-modal");
}

/* populate_privilege_list
 * Receives: Nothing
 * Does: clears privilege management list and group select lists, then
 * calls "net sam rights list SeDiskOperatorPrivilege" to get list
 * Returns: Nothing
 */
function populate_privilege_list() {
    var list = document.getElementById("privilege-list")

    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    var proc = cockpit.spawn(["net", "sam", "rights", "list", "SeDiskOperatorPrivilege"], { err: "out", superuser: "require" });
    proc.done(function (data) {
        if(data == "") {
            var emptyList = document.createElement("div");
            emptyList.innerText = 'No privileges set. Click the "plus" to add one.';
            list.appendChild(emptyList)
        } else {
            var rows = data.split("\n");
            rows.pop();
            rows.forEach(function (obj) {
                list.appendChild(create_privilege_list_entry(obj));
            });
        }
    });
    proc.fail(function (ex, data) {
        let privilegeNotification = new Notification("privilege");
        privilegeNotification.setError("Failed to get list of privileges: " + data);
    });
    return proc;
} 


/* rm_privilege
 * Receives: entry_name, element_list
 * Does: Removes list entry from privilege group
 * Returns: Nothing
 */
function rm_privilege(entry_name, element_list) {
    let privilegeNotification = new Notification("privilege");
    privilegeNotification.setSpinner();
    var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/samba-manager/scripts/del_privileges.py", entry_name], {
        err: "out",
        superuser: "require",
    });
    proc.done(function () {
        privilegeNotification.setSuccess("Successfully deleted " + entry_name + ".");
        element_list.forEach((elem) => elem.remove());
        populate_privilege_list();
    });
    proc.fail(function (data) {
        privilegeNotification.setError(data);
    });
    hideModal("rm-privilege-modal");
}

/* create_privilege_list_entry
 * Receives: entry_name
 * Does: creates a list with name entry_name
 * Returns: Nothing
 */
function create_privilege_list_entry(entry_name) {
    var entry = create_list_entry(entry_name, show_rm_privilege_dialog)
    entry.classList.add("row-45d", "flex-45d-space-between", "flex-45d-center");
    return entry;
}

/* show_rm_privilege_dialog
 * Receives: Nothing
 * Does: shows remove privilege modal
 * Returns: Nothing
 */
function show_rm_privilege_dialog(entry_name, element_list) {
    var entry_name_fields = document.getElementsByClassName("privilege-to-remove");
    for (let field of entry_name_fields) {
        field.innerText = entry_name;
    }
    
    showModal("rm-privilege-modal");

    var continue_rm_privilege = document.getElementById("continue-rm-privilege");
    continue_rm_privilege.onclick = function () {
        rm_privilege(entry_name, element_list);
    };
}

/* add_privilege
 * Receives: Nothing
 * Does: Takes inputted values and run them through
 * net sam rights grant group SeDiskOperatorPrivilege -U username%password
 * to give rights to the group. Then refresh page.
 * Returns: Nothing
 */
async function add_privilege() {
    let privilegeNotification = new Notification("privilege-group");

    var group = document.getElementById("privilege-group").value;
    var username = document.getElementById("privilege-username").value;
    var password = document.getElementById("privilege-password").value;

    if (group == "")
        privilegeNotification.setError("Enter a group.");
    else if (username == "")
        privilegeNotification.setError("Enter a username.");
    else if (password == "")
        privilegeNotification.setError("Enter a password.");
    else {
        let addNotification = new Notification("add-privilege");

        var proc = cockpit.spawn(["/usr/share/cockpit/file-sharing/samba-manager/scripts/set_privileges.py", group, username, password], {
            err: "out",
            superuser: "require",
        });
        proc.done(function(data) {
            if (data != "") {
                addNotification.setError(data);
            }
            else {
                populate_privilege_list();
                addNotification.setSuccess("Added privilege!");
                hideModal("privilege-modal");
            }
        });
        proc.fail(function(data) {
            addNotification.setError("Could not set privileges: " + data);
        });
    }
}

/* set_up_buttons
 * Receives: nothing
 * Does: sets up event listener callbacks for button presses and field input
 * Returns: nothing
 */
function set_up_buttons() {
    // User Management
    document.getElementById("user-selection").addEventListener("change", update_username_fields);

    document.getElementById("cancel-rm-from-group-btn").addEventListener("click", () => {hideModal("rm-from-group-modal");});

    document.getElementById("show-smbpasswd-dialog-btn").addEventListener("click", () => {showModal("smbpasswd-modal"), function() {
            document.getElementById("smbpasswd-pw1").value = "";
            document.getElementById("smbpasswd-pw2").value = "";
        }});
    document.getElementById("cancel-smbpasswd").addEventListener("click", () => {hideModal("smbpasswd-modal");});
    document.getElementById("set-smbpasswd").addEventListener("click", set_smbpasswd);

    document.getElementById("show-rm-smbpasswd-btn").addEventListener("click", () => {showModal("rm-smbpasswd-modal");});
    document.getElementById("cancel-rm-smbpasswd").addEventListener("click", () => {hideModal("rm-smbpasswd-modal");});
    document.getElementById("continue-rm-smbpasswd").addEventListener("click", rm_smbpasswd);

    document.getElementById("add-group-to-user").addEventListener("click", () => {
            showModal("add-user-group-modal", function() {
                // Clears
                var elems = document.querySelectorAll(".checkmark");
                [].forEach.call(elems, function (el) {
                    el.checked = false;
                });
                selections = [];
            });
        });
    document.getElementById("add-to-group-btn").addEventListener("click", check_duplicates);
    document.getElementById("cancel-group-to-user").addEventListener("click", () => {hideModal("add-user-group-modal");});

    // Group Management
    document.getElementById("cancel-rm-group").addEventListener("click", () => {hideModal("rm-group-modal")});

    document.getElementById("add-group-btn").addEventListener("click", () => {showModal("add-group-modal")});
    document.getElementById("cancel-add-group").addEventListener("click", () => {hideModal("add-group-modal")});
    document.getElementById("continue-add-group").addEventListener("click", add_group);
    document.getElementById("new-group-name").addEventListener("input", check_group_name);

    // Share Management
    document.getElementById("add-share-btn").addEventListener("click", function () {
            show_share_dialog("create");
        });
    document.getElementById("cancel-share").addEventListener("click", () => {hideModal("share-modal")});
    document.getElementById("show-advanced-share-dropdown-btn").addEventListener("click", toggle_advanced_share_settings);
    document.getElementById("shadowcopy").addEventListener("click", check_shadow_copy);
    document.getElementById("macos").addEventListener("click", function() {
            populate_advanced_share_settings("macos", "fruit:", "fruit:encoding = native\nfruit:metadata = stream", "catia fruit streams_xattr");
        });
    document.getElementById("auditlogs").addEventListener("click", function() {
            populate_advanced_share_settings("auditlogs", "full_audit:", "full_audit:priority = notice\nfull_audit:facility = local5\nfull_audit:success = connect disconnect mkdir rmdir read write rename\nfull_audit:failure = connect\nfull_audit:prefix = %u|%I|%S", "full_audit");
        });
    document.getElementById("windows-acls").addEventListener("click", windows_acl);
    document.getElementById("share-name").addEventListener("input", verify_share_settings);
    document.getElementById("path").addEventListener("input", verify_share_settings);

    document.getElementById("cancel-rm-share").addEventListener("click", () => {hideModal("rm-share-modal")});

    document.getElementById("samba-global-btn").addEventListener("click", show_samba_global_dialog);
    document.getElementById("cancel-samba-global").addEventListener("click", () => {hideModal("samba-global-modal");});
    document.getElementById("show-advanced-global-dropdown-btn").addEventListener("click", toggle_advanced_global_settings);
    document.getElementById("continue-samba-global").addEventListener("click", edit_samba_global);
    document.getElementById("advanced-global-settings-input").addEventListener("input", check_enable_log_level_dropdown);

    document.getElementById("path").addEventListener("input", nav_bar_update_choices)

    document.getElementById("show-privilege-btn").addEventListener("click", () => {showModal("privilege-modal")});
    document.getElementById("cancel-privilege-btn").addEventListener("click", () => {hideModal("privilege-modal")});
    document.getElementById("add-privilege-btn").addEventListener("click", add_privilege);
    document.getElementById("cancel-rm-privilege").addEventListener("click", () => {hideModal("rm-privilege-modal")});


    // Set callback to dynamically resize textareas to fit height of text
    var text_areas = document.getElementsByTagName("textarea");
    for (let text_area of text_areas) {
        text_area.addEventListener("input", function () {
            this.style.height = "";
            this.style.height = Math.max(this.scrollHeight + 5, 50) + "px";
        });
    }
}

/* check_permissions
 * Receives: nothing
 * Does: tries running `net conf list` as superuser, if successful, calls check_smb_conf(), if unsuccessful,
 * shows error message and disables buttons
 * Returns: nothing
 */
function check_permissions() {
    var proc = cockpit.spawn(["net", "conf", "list"], { superuser: "require" });
    proc.done(function (data) {
        check_smb_conf();
    });
    proc.fail(function (ex, data) {
        if(ex.problem === "not-found") {
            fatal_error("Samba is not installed. Please install...");
        } 
        else {
            fatal_error("User account lacks permission to configure Samba!");
        }
    });
}

/* check_smb_conf
 * Receives: nothing
 * Does: checks /etc/samba/smb.conf for the line "include = registry", if there, calls setup
 * Returns: nothing
 */
function check_smb_conf() {
    var proc = cockpit.spawn(["cat", "/etc/samba/smb.conf"]);
    proc.done(function (data) {
        var config_ok;
        // config_ok = /(?<!#\s*)include\s*=\s*registry/i.test(data);
        // shame on you Safari for not implementing regex lookbehind
        config_ok =
            /include\s*=\s*registry/i.test(data) &&
            !/#\s*include\s*=\s*registry/i.test(data);
        if (config_ok) setup();
        else
            fatal_error(
                "Samba must be configured to include registry. Add `include = registry` to the [global] section of /etc/samba/smb.conf"
            );
    });
}

/* setup
 * Receives: nothing
 * Does: calls initialization functions to set up plugin
 * Returns: nothing
 */
async function setup() {
    await get_global_conf();
    await populate_share_list();
    get_domain_range();
    await add_group_options();
    await add_user_options();
    await populate_privilege_list();
    set_up_buttons();
    hideModal("setup-spinner-wrapper");
}

/* main
 * Entrypoint of script
 * Does: checks for permission to become root, which then calls setup on success
 * Returns: nothing
 */
function main() {
    check_permissions();
}

main();
