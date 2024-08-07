import type { Pool } from "@/tabs/iSCSI/types/cluster/Pool";

export interface RadosBlockDevice {
    pool: Pool;
    maximumSize: String;
}
