import * as fse from 'fs-extra';
import { ExecParam } from './languages';
import { config as Config } from './config';
import { SandboxParameter, MountInfo } from 'simple-sandbox/src/interfaces';
import * as posix from 'posix';
import * as klaw from 'klaw';
import * as pathLib from 'path';

export function setWriteAccess(dirName: string, writeAccess: boolean): Promise<void> {
    const user = posix.getpwnam(Config.sandbox.user);
    const operations: Promise<void>[] = [];
    return new Promise<void>((res, rej) => {
        klaw(dirName).on('data', (item) => {
            operations.push((async () => {
                const path = item.path;
                await fse.chmod(path, 0o755);
                if (writeAccess) {
                    await fse.chown(path, user.uid, user.gid);
                } else {
                    await fse.chown(path, process.getuid(), process.getgid());
                }
            })());
        }).on('end', () => {
            Promise.all(operations).then(() => res(), (err) => rej(err));
        });
    });
}

export async function createOrEmptyDir(path: string): Promise<void> {
    try {
        await fse.mkdir(path);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    await fse.emptyDir(path);
}

export function cloneObject<T>(src: T): T {
    return Object.assign({}, src);
}

export function sandboxize(execParam: ExecParam, mounts: MountInfo[]): SandboxParameter {
    const result = Object.assign(cloneObject(execParam), Config.sandbox);
    result.mounts = mounts;
    return result;
}

export function fileTooLongPrompt(actualSize: number, bytesRead: number): string {
    const omitted = actualSize - bytesRead;
    return `<${omitted} byte${omitted != 1 ? 's' : ''} omitted>`;
}

export async function readFileLength(path: string, lengthLimit: number, appendPrompt = fileTooLongPrompt)
    : Promise<string> {
    let file = -1;
    try {
        file = await fse.open(path, 'r');
        const actualSize = (await fse.stat(path)).size;
        const buf = new Buffer(Math.min(actualSize, lengthLimit));
        const bytesRead = await fse.read(file, buf, 0, buf.length, 0) as any as number;
        let ret = buf.toString('utf8', 0, bytesRead);
        if (bytesRead < actualSize) {
            ret += '\n' + appendPrompt(actualSize, bytesRead);
        }
        return ret;
    } catch (e) {
        return "";
    } finally {
        if (file != -1) {
            await fse.close(file);
        }
    }
}

export async function tryEmptyDir(path: string) {
    try {
        await fse.emptyDir(path);
    } catch (e) { }
}
