import { Language } from './languages';
import { config as Config } from './config';
import * as fse from 'fs-extra';
import * as _ from 'lodash';
import { startSandbox } from 'simple-sandbox/lib/index';
import { SandboxParameter, MountInfo, SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { SandboxProcess } from 'simple-sandbox/lib/sandboxProcess';
import { createOrEmptyDir, sandboxize, readFileLength, setWriteAccess } from './utils';
import * as Bluebird from 'bluebird';
import * as getFolderSize from 'get-folder-size';
import * as randomString from 'randomstring';
const getSize: any = Bluebird.promisify(getFolderSize);

export interface CompilationResult {
    ok: boolean,
    message?: string
}

export async function compile(source: string, language: Language, targetDir: string): Promise<CompilationResult> {

    const srcDir = `${Config.workingDirectory}/src-${randomString.generate(10)}`;
    const binDir = targetDir;
    await createOrEmptyDir(srcDir);
    await setWriteAccess(srcDir, false);
    await setWriteAccess(binDir, true);

    const srcPath = `${srcDir}/${language.sourceFileName}`;
    await fse.writeFile(srcPath, source, { encoding: 'utf8' });

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
                    message: `Compiler returned ${sandboxResult.code}\n` + await readFileLength
                        (binDir + '/' + compileConfig.messageFile,
                        Config.compilerMessageLimit)
                };
            }
        } else {
            result = {
                ok: false,
                message: `A ${SandboxStatus[sandboxResult.status]} encountered when compiling your code. ` + await readFileLength
                        (binDir + '/' + compileConfig.messageFile,
                        Config.compilerMessageLimit)
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