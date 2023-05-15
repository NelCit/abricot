import { ReaderBigEndianStream } from "io/reader";
import { Dofus2Packet } from "./types";

export default class Dofus2PacketAnalyzer {
    private readonly reader: ReaderBigEndianStream =
        new ReaderBigEndianStream();

    analyze(buffer: Buffer, client_side: boolean): Array<Dofus2Packet> {
        this.reader.add(buffer, buffer.length);
        const result: Array<Dofus2Packet> = [];

        while (this.reader.remnant_size() > 0) {
            if (this.reader.remnant_size() < 2) {
                break;
            }

            const initial_offset = this.reader.offset;
            const header = this.reader.read_uint16();

            const static_header = header & 3;
            const message_id = header >> 2;

            if (client_side && this.reader.remnant_size() < 4) {
                this.reader.set_offset(initial_offset);
                break;
            }

            const instance_id = client_side ? this.reader.read_uint32() : 0;

            if (this.reader.remnant_size() < static_header) {
                this.reader.set_offset(initial_offset);
                break;
            }

            let length = 0;
            for (let i = static_header - 1; i >= 0; i--) {
                length = length | ((this.reader.read_uint8() & 255) << (i * 8));
            }

            if (this.reader.remnant_size() < length) {
                this.reader.set_offset(initial_offset);
                break;
            }

            const data = this.reader.read_bytes(length);

            result.push({
                header: static_header,
                id: message_id,
                instance_id,
                data,
                length,
                side: client_side ? "client" : "server",
                timestamp: new Date(),
            });
        }

        this.reader.remove_before_offset();
        return result;
    }
}
