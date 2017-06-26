import * as fse from 'fs-extra';
import * as Bluebird from 'bluebird';

export interface Input {
    fileName: string;
    source: BinarySource;
}

// For reading files.
export abstract class BinarySource {
    abstract async copyTo(dest: string): Promise<void>;
}

export class InputFromFile extends BinarySource {
    constructor(private source: string) {
        super();
    }

    async copyTo(dest: string) {
        await fse.copy(this.source, dest);
    }
}

export class InputFromBuffer extends BinarySource {
    constructor(private source: Buffer) {
        super();
    }

    async copyTo(dest: string) {
        await fse.writeFile(dest, this.source);
    }
}