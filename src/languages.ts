import * as path from 'path';

export interface ExecParam {
    executable: string;
    parameters: string[];
    time: number;
    memory: number;
    process: number;
    stdin?: string;
    stdout?: string;
    stderr?: string;
    messageFile?: string;
    workingDirectory: string;
}

export interface Language {
    name: string;
    fileExtension: string;

    sourceFileName: string;
    binarySizeLimit: number;
    compile: (sourcePath: string, outputDirectory: string) => ExecParam;
    run: (binaryDirectory: string,
        workingDirectory: string,
        time: number,
        memory: number,
        stdinFile?: string,
        stdoutFile?: string,
        stderrFile?: string
    ) => ExecParam;
}

const languageDirectory: string = path.join(__dirname, 'languages');
export const languages: Language[] = require('fs').readdirSync(languageDirectory).filter(filename => filename.endsWith('.js')).map(filename => require(path.join(languageDirectory, filename)));
