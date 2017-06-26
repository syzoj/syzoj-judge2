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

export const languages: Language[] = [{
    name: "cpp",
    sourceFileName: "a.cpp",
    fileExtension: "cpp",
    binarySizeLimit: 5000 * 1024,

    // Note that these two paths are in the sandboxed environment.
    compile: (sourcePath, outputDirectory) => ({
        // To customize the compilation process,
        // write a shell script or some other stuff, 
        // and put it to your sandbox.
        executable: "/usr/bin/g++",
        parameters: ["g++", sourcePath, "-o", `${outputDirectory}/a.out`, "-v"],
        time: 5000,
        memory: 201 * 1024 * 1024, // 20MB
        process: 10,
        // This is just a redirection. You can simply ignore this
        // if you can specify custom location for message output
        // in the parameter of the compiler, or have redirected the compilation 
        // message to somewhere.
        // An example will be available soon.
        stderr: `${outputDirectory}/message.txt`,
        // We will read this file for message in the output directory.
        messageFile: 'message.txt',
        workingDirectory: outputDirectory
    }),

    run: (binaryDirectory: string,
        workingDirectory: string,
        time: number,
        memory: number,
        stdinFile = null,
        stdoutFile = null,
        stderrFile = null
    ) => ({
        executable: `${binaryDirectory}/a.out`,
        parameters: [],
        time: time,
        memory: memory,
        process: 10,
        stdin: stdinFile,
        stdout: stdoutFile,
        stderr: stderrFile,
        workingDirectory: workingDirectory
    })
}];
