## Cockpit File Sharing 4.2.10-1

* Changes scst default config path in one other spot that was initially missed, and adds check to see if file exists and replaces old config path with new config path if applicable. Should fix bug where scst config not auto-loading on boot.