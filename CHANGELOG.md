## Cockpit File Sharing 4.2.10-1

* Defer applying Ceph options until apply button is clicked
* Add shadow:localtime = yes to default shadow-copy share options
* Auto hide tabs that aren't configured
* Allow overriding tab visibility in user settings menu
* Get PCS cluster nodes from corosync.conf since Ubuntu 20.04 pcs version does not have JSON output
* Migrate samba management code to houston-common-lib