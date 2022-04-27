# Automatic Houston Plugin Makefile
# Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>
# 
# Automatic Houston Plugin Makefile is free software: you can redistribute it and/or modify it under the terms
# of the GNU General Public License as published by the Free Software Foundation, either version 3
# of the License, or (at your option) any later version.
# 
# Automatic Houston Plugin Makefile is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
# without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License along with Automatic Houston Plugin Makefile.
# If not, see <https://www.gnu.org/licenses/>. 

# PLUGIN_SRCS is space-delimited list of subdirectories containg a plugin project.
# You can leave it empty for automatic detection based on directories containing a package.json file.
PLUGIN_SRCS=
REMOTE_TEST_HOST=osd1
REMOTE_TEST_USER=root
RESTART_COCKPIT?=0

# USAGE
# installation:
# $ make
# # make install
# testing:
# $ make
# $ make install-local
# or
# $ make install-remote
################################
# Do not edit anything below

define greentext
	'\033[1;32m$(1)\033[0m'
endef
define cyantext
	'\033[1;96m$(1)\033[0m'
endef

ifndef PLUGIN_SRCS
PLUGIN_SRCS:=$(patsubst %/package.json,%,$(wildcard */package.json))
endif

OUTPUTS:=$(patsubst %, %/dist/index.html, $(PLUGIN_SRCS))

REMOTE_TEST_HOME:=$(shell ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST) 'echo $$HOME')
NPM_PREFIX:=$(shell command -v yarn > /dev/null 2>&1 && echo 'yarn --cwd' || echo 'npm --prefix')

default: $(OUTPUTS)

all: default

.PHONY: default all install clean help install-local install-remote install

# build outputs
.SECONDEXPANSION:
$(OUTPUTS): %/dist/index.html: $$(shell find $$*/{src,public} -type f) $$(shell find $$* -name 'yarn.lock' -o -name 'package.json' -not -path '*node_modules*') $$*/*.html  $$*/*.js
	@echo -e $(call cyantext,Building $*)
	$(NPM_PREFIX) $* install
	$(NPM_PREFIX) $* run build
	@echo -e $(call greentext,Done building $*)
	@echo

# system install, requires `systemctl restart cockpit.socket`
# runs plugin-install-* for each plugin
.SECONDEXPANSION:
install install-local install-remote: default $$(addprefix plugin-$$@-, $$(PLUGIN_SRCS))
ifeq ($(RESTART_COCKPIT), 1)
ifndef DESTDIR
	$(SSH) systemctl stop cockpit.socket
	$(SSH) systemctl start cockpit.socket
endif
endif

install-remote : SSH=ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST)

plugin-install-% plugin-install-local-% plugin-install-remote-%:
	@echo -e $(call cyantext,Installing $*)
	@echo Creating install directory
	$(SSH) mkdir -p $(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX)
	@echo
	@echo Copying files
	@test -z "$(SSH)" && \
		cp -af $*/dist/* $(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX) || \
		rsync -avh $*/dist/* $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST):$(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX)
	@echo -e $(call greentext,Done installing $*)
	@echo

plugin-install-% : INSTALL_PREFIX?=/usr/share/cockpit

plugin-install-local-% : INSTALL_PREFIX=$(HOME)/.local/share/cockpit
plugin-install-local-% : INSTALL_SUFFIX=-test

plugin-install-remote-% : INSTALL_PREFIX=$(REMOTE_TEST_HOME)/.local/share/cockpit
plugin-install-remote-% : INSTALL_SUFFIX=-test
plugin-install-remote-% : SSH=ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST)

clean: FORCE
	rm $(dir $(OUTPUTS)) -rf

help:
	@echo 'make usage'
	@echo
	@echo 'building:'
	@echo '    make'
	@echo
	@echo 'installation:'
	@echo '    make install [RESTART_COCKPIT=1]' 
	@echo
	@echo 'testing:'
	@echo '    make install-local [RESTART_COCKPIT=1]'
	@echo 'or'
	@echo '    make install-remote [RESTART_COCKPIT=1]'
	@echo
	@echo 'build cleanup:'
	@echo '    make clean'

FORCE:
