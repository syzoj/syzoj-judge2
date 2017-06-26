import { startSandbox } from 'simple-sandbox/lib/index';
import { SandboxParameter, MountInfo, SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { SandboxProcess } from 'simple-sandbox/lib/sandboxProcess';
import { config as Config } from './config';
import { createOrEmptyDir, sandboxize, readFileLength, setWriteAccess } from './utils';
import { Language } from './languages';
import * as Bluebird from 'bluebird';
import * as fse from 'fs-extra';
import * as getFolderSize from 'get-folder-size';
const getSize: any = Bluebird.promisify(getFolderSize);

export interface RunResult {
    outputLimitExceeded: boolean;
    result: SandboxResult;
}

export interface DiffResult {
    pass: boolean;
    message: string;
}

export async function runDiff(dataDir: string, file1: string, file2: string): Promise<DiffResult> {
    await setWriteAccess(dataDir, true);
    const tmpPath = '/sandbox/1', outputFileName = 'diff.txt';
    const sandbox = await startSandbox(Object.assign({
        executable: '/usr/bin/diff',
        parameters: ['/usr/bin/diff', '-Bbq', file1, file2],
        time: Config.spjTimeLimit,
        memory: Config.spjMemoryLimit * 1024 * 1024,
        process: 2,
        stdin: null,
        stdout: outputFileName,
        stderr: null,
        workingDirectory: tmpPath,
        mounts: [{
            src: dataDir,
            dst: tmpPath,
            limit: -1
        }]
    }, Config.sandbox));
    const sandboxResult = await sandbox.waitForStop();

    if (sandboxResult.status !== SandboxStatus.OK) {
        return { pass: false, message: `Diff encountered ${SandboxStatus[sandboxResult.status]}` }
    }

    const message = await fse.readFile(dataDir + '/' + outputFileName, 'utf8');
    return { pass: sandboxResult.code === 0, message: message };
}

export async function runProgram(language: Language,
    binDir: string,
    dataDir: string,
    time: number,
    memory: number,
    stdinFile?: string,
    stdoutFile?: string,
    stderrFile?: string): Promise<RunResult> {

    await setWriteAccess(binDir, false);
    await setWriteAccess(dataDir, true);

    const dataDir_Sandbox = '/sandbox/1';
    const binDir_Sandbox = '/sandbox/2';
    const runConfig = language.run(binDir_Sandbox, dataDir_Sandbox, time, memory, stdinFile, stdoutFile, stderrFile);

    const sandboxParam = sandboxize(runConfig, [{
        src: binDir,
        dst: binDir_Sandbox,
        limit: 0
    }, {
        src: dataDir,
        dst: dataDir_Sandbox,
        limit: -1
    }]);

    let result: SandboxResult = null;
    try {
        console.log("Starting sandbox!!!!!!!!!!!!!!!!");
        const sandbox = await startSandbox(sandboxParam);
        result = await sandbox.waitForStop();
        console.log("Sandbox done!!!!!!!!!!!!!!!!");
    } finally {
        if (result === null || result.status !== SandboxStatus.OK) {
            await fse.emptyDir(dataDir);
        }
    }

    let ole = false;
    const outputSize = await getSize(binDir);
    if (outputSize > Config.outputLimit) {
        await fse.emptyDir(dataDir);
        ole = true;
    }

    return {
        outputLimitExceeded: ole,
        result: result
    };
}