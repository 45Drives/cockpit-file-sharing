import { BashCommand, ProcessError, type Server, File } from "@45drives/houston-common-lib";
import type { ResultAsync } from "neverthrow";

export class ConfigurationManager {
    server: Server;
    
    backupConfigurationFilePath: string = "/tmp/iSCSI.conf";

    constructor(server: Server) {
        this.server = server;
    }

    exportConfiguration(): ResultAsync<string, ProcessError> {
        return this.server.execute(new BashCommand(`scstadmin -write_config ${this.backupConfigurationFilePath}`)).andThen(() =>
            this.server.execute(new BashCommand(`cat ${this.backupConfigurationFilePath}`)).map((proc) => 
                proc.getStdout()
            )
        )
    }

    importConfiguration(newConfig: string) {
        return new File(this.server, this.backupConfigurationFilePath)
                .create()
                .andThen((file) => file.write(newConfig))
                .andThen(() => this.server.execute(new BashCommand(`scstadmin -check_config ${this.backupConfigurationFilePath}`)))
                .map(() => this.server.execute(new BashCommand(`scstadmin -config ${this.backupConfigurationFilePath} -force -noprompt`)))
                .mapErr(() => new ProcessError("Config file syntax validation failed."))
                
    }
}