import BaseModule from "app/module";
import Scanner from "./scanner";
import {
    ScannerConnectPayload,
    ScannerReceivePayload,
    ScannerSendPayload,
} from "./types";
import { mark_function } from "app/utils";

export type CreateScannerParams = {
    pid: number;
};

export type HasScannerParams = {
    pid: number;
};

export type SendClientParams = {
    pid: number;
    fd: number;
    buffer: Buffer | { data: Array<number> };
};

export type MITMModuleEvent = {
    onScannerCreate: (
        scanner: Scanner,
        pid: number,
        result: "create" | "already_exist"
    ) => void;
    onScannerConnect: (
        scanner: Scanner,
        payload: ScannerConnectPayload
    ) => void;
    onScannerRecv: (
        scanner: Scanner,
        payload: ScannerReceivePayload,
        buffer: Buffer
    ) => void;
    onScannerSend: (
        scanner: Scanner,
        payload: ScannerSendPayload,
        buffer: Buffer
    ) => void;
};

export default class MITMModule extends BaseModule<MITMModuleEvent> {
    private readonly scanners: Record<number, Scanner>;

    constructor(config: Record<string, any>) {
        super(config);

        this.scanners = {};

        // add to WS_API
        mark_function(this.create_scanner, "ws_api");
        mark_function(this.has_scanner, "ws_api");
        mark_function(this.send_client, "ws_api");
    }

    create_scanner({ pid }: CreateScannerParams = { pid: 0 }): void {
        if (this.scanners[pid]) {
            this.emit(
                "onScannerCreate",
                this.scanners[pid],
                pid,
                "already_exist"
            );
            this.get_logger().log("error", `scanner already exists on ${pid}`);
            return;
        }

        const scanner = new Scanner(
            pid,
            (payload) => {
                this.emit("onScannerConnect", this.scanners[pid], payload);
            },
            (payload, buffer) => {
                this.emit("onScannerRecv", this.scanners[pid], payload, buffer);
            },
            (payload, buffer) => {
                this.emit("onScannerSend", this.scanners[pid], payload, buffer);
            },
            (error) => {
                this.get_logger().log("error", error.description);
            }
        );

        scanner.start().then((created) => {
            if (created) {
                this.emit("onScannerCreate", this.scanners[pid], pid, "create");
                this.get_logger().log("info", `scanner started on pid ${pid}`);
                this.scanners[pid].get_frida().load_pscript("funcs").catch();
                this.scanners[pid] = scanner;
            }
        });
    }

    has_scanner({ pid }: HasScannerParams = { pid: 0 }) {
        return pid in this.scanners;
    }

    send_client({ pid, fd, buffer }: SendClientParams): boolean {
        if (!this.has_scanner({ pid })) {
            return false;
        }

        const buff = "data" in buffer ? Buffer.from(buffer.data) : buffer;

        this.scanners[pid]
            .get_frida()
            .get_script("funcs")
            .exports.send_client(fd, buff, buff.length);

        return true;
    }

    import(): void {}
    dispose(): void {}
}
