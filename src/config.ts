import * as commandLineArgs from 'command-line-args';
import * as fs from 'fs';

export interface SandboxConfigBase {
    chroot: string;
    mountProc: boolean;
    redirectBeforeChroot: boolean;
    user: string;
    cgroup: string;
    environments: string[];
}

export interface ConfigStructure {
    workingDirectory: string;
    webUrl: string;
    webToken: string;
    testDataDirectory: string;
    delay: number;
    outputLimit: number;
    stderrDisplayLimit: number;
    compilerMessageLimit: number;
    dataDisplayLimit: number;
    spjTimeLimit: number;
    spjMemoryLimit: number;
    fullScore: number;
    sandbox: SandboxConfigBase;
    verbose: boolean;
}

const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'instance-config', alias: 'i', type: String },
    { name: 'shared-config', alias: 's', type: String }
];

const options = commandLineArgs(optionDefinitions);

console.log(options);

function readJSON(path: string): any {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const instanceConfig = readJSON(options["instance-config"]);
const sharedConfig = readJSON(options["shared-config"]);

export const config: ConfigStructure = {
    workingDirectory: instanceConfig.workingDirectory,
    webUrl: sharedConfig.webUrl,
    webToken: sharedConfig.webToken,
    testDataDirectory: sharedConfig.dataDirectory,
    delay: sharedConfig.delay,
    outputLimit: sharedConfig.outputLimit,
    stderrDisplayLimit: sharedConfig.stderrDisplayLimit,
    compilerMessageLimit: sharedConfig.compilerMessageLimit,
    dataDisplayLimit: sharedConfig.dataDisplayLimit,
    spjTimeLimit: sharedConfig.spjTimeLimit,
    spjMemoryLimit: sharedConfig.spjMemoryLimit,
    fullScore: sharedConfig.fullScore,
    sandbox: {
        chroot: sharedConfig.sandboxRoot,
        mountProc: true,
        redirectBeforeChroot: false,
        user: sharedConfig.sandboxUser,
        cgroup: instanceConfig.sandboxCgroup,
        environments: sharedConfig.sandboxEnvironments
    },
    verbose: options.verbose
}