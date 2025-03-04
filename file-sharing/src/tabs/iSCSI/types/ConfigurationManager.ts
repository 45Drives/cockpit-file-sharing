import { useUserSettings } from "@/common/user-settings";
import { BashCommand, ProcessError, type Server, File } from "@45drives/houston-common-lib";
import type { ResultAsync } from "neverthrow";

export class ConfigurationManager {
    server: Server;
    
    constructor(server: Server) {
        this.server = server;
    }

    exportConfiguration(): ResultAsync<string, ProcessError> {
        return this.server.execute(new BashCommand(`scstadmin -write_config ${useUserSettings().value.iscsi.confPath}`)).andThen(() =>
            this.server.execute(new BashCommand(`cat ${useUserSettings().value.iscsi.confPath}`)).map((proc) => 
                proc.getStdout()
            )
        )
    }

    importConfiguration(newConfig: string) {
        return new File(this.server, useUserSettings().value.iscsi.confPath)
            .create()
            .andThen((file) => file.write(newConfig))
            .andThen(() => this.server.execute(new BashCommand(`scstadmin -check_config ${useUserSettings().value.iscsi.confPath}`)))
            .map(() => this.server.execute(new BashCommand(`scstadmin -config ${useUserSettings().value.iscsi.confPath} -force -noprompt`)))
            .mapErr(() => new ProcessError("Config file syntax validation failed."))
    }

    // saveCurrentConfiguration(): ResultAsync<File, ProcessError> {
    //     return new File(this.server, useUserSettings().value.iscsi.confPath)
    //     .create(true)
    //     .andThen((file) => this.exportConfiguration().map((config) => file.write(config)).map(() => file))
    // }

    saveCurrentConfiguration(): ResultAsync<File, ProcessError> {
        return new File(this.server, useUserSettings().value.iscsi.confPath)
            .create(true)
            .andThen((file) =>
                this.exportConfiguration()
                    .map((config) => file.write(config))
                    // .andThen(() => this.server.execute(new BashCommand(`systemctl enable scst`)))
                    // .andThen(() => this.server.execute(new BashCommand(`scstadmin -config ${useUserSettings().value.iscsi.confPath} -force -noprompt`)))
                    // .andThen(() => this.server.execute(new BashCommand(`systemctl restart scst`)))
                    .andThen(() => this.server.execute(new BashCommand(`
                        if ! systemctl is-enabled scst &>/dev/null; then
                            systemctl enable scst
                        fi
                    `)))
                    .map(() => file)
            );
    }
}