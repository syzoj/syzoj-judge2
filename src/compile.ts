import { Language } from './languages';
import { config as Config } from './config';
import * as fse from 'fs-extra';
import * as _ from 'lodash';
import { startSandbox } from 'simple-sandbox/lib/index';
import { SandboxParameter, MountInfo, SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { SandboxProcess } from 'simple-sandbox/lib/sandboxProcess';
import { createOrEmptyDir, sandboxize, readFileLength, setWriteAccess } from './utils';
import { FileContent } from './testData';
import * as Bluebird from 'bluebird';
import * as getFolderSize from 'get-folder-size';
import * as randomString from 'randomstring';
import * as path from 'path';
const getSize: any = Bluebird.promisify(getFolderSize);

export interface CompilationResult {
    ok: boolean,
    message?: string
}

export async function compile(source: string, language: Language, targetDir: string, extraFiles: FileContent[] = []): Promise<CompilationResult> {
    const srcDir = `${Config.workingDirectory}/src-${randomString.generate(10)}`;
    const binDir = targetDir;
    const tempDir = `${Config.workingDirectory}/temp`;
    await createOrEmptyDir(srcDir);
    await createOrEmptyDir(tempDir);
    await setWriteAccess(srcDir, false);
    await setWriteAccess(binDir, true);
    await setWriteAccess(tempDir, true);

    const writeTasks: Promise<void>[] = [];
    if (extraFiles) {
        for (const f of extraFiles) {
            writeTasks.push(fse.writeFile(path.join(srcDir, f.name), f.content, { encoding: 'utf8' }));
        }
    }
    const srcPath = `${srcDir}/${language.sourceFileName}`;
    writeTasks.push(fse.writeFile(srcPath, source, { encoding: 'utf8' }));
    await Promise.all(writeTasks);

    const srcDir_Sandbox = '/sandbox/1';
    const binDir_Sandbox = '/sandbox/2';
    const compileConfig = language.compile(
        `${srcDir_Sandbox}/${language.sourceFileName}`, binDir_Sandbox);

    const sandboxParam = sandboxize(compileConfig, [{
        src: srcDir,
        dst: srcDir_Sandbox,
        limit: 0
    }, {
        src: binDir,
        dst: binDir_Sandbox,
        limit: -1
    }, {
        src: tempDir,
        dst: '/tmp',
        limit: -1
    }]);

    let result = { ok: false, message: '' };

    try {
        const sandbox = await startSandbox(sandboxParam);
        const sandboxResult = await sandbox.waitForStop();

        // If the compiler exited
        if (sandboxResult.status === SandboxStatus.OK) {
            // If the compiler did not return an error
            if (sandboxResult.code === 0) {
                const outputSize = await getSize(binDir);
                // If the output is too long
                if (outputSize > language.binarySizeLimit) {
                    result = {
                        ok: false,
                        message: `Your source code compiled to ${outputSize} bytes which is too big, too thick, too long for us..`
                    };
                } else { // OK
                    result.ok = true;
                }
            } else { // If compilation error
                result = {
                    ok: false,
                    message: await readFileLength(binDir + '/' + compileConfig.messageFile, Config.compilerMessageLimit)
                };
            }
        } else {
            result = {
                ok: false,
                message: (`A ${SandboxStatus[sandboxResult.status]} encountered while compiling your code.\n\n` + await readFileLength(binDir + '/' + compileConfig.messageFile, Config.compilerMessageLimit)).trim()
            };
        }
    } finally {
        if (!result.ok) {
            await fse.emptyDir(binDir);
        }
        await fse.remove(srcDir);
    }

    return result;
}
