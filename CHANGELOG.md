## Cockpit File Sharing 3.1.8-1

* Remove realm and wbinfo dependencies by getting users and groups with `getent -s winbind -s sss -s ldap`
* Handle directory permissions by numeric ID rather than user/group name
* Fixed yet another regex bug in validating smb.conf