export const lang =  {

    name: "elixir",

    sourceFileName: "a.ex",

    fileExtension: "ex",

    binarySizeLimit: 5000 * 1024,



    // Note that these two paths are in the sandboxed environment.

    compile: (sourcePath, outputDirectory) => ({

        // To customize the compilation process,

        // write a shell script or some other stuff, 

        // and put it to your sandbox.

        executable: "/usr/bin/elixirc",

        parameters: ["elixirc", sourcePath, outputDirectory, "elixirc a.ex"],

        time: 5000,

        memory: 1024 * 1024 * 1024,

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

        executable: "/usr/bin/elixir",

        parameters: ["elixir", `${binaryDirectory}/a.ex`, "-e Main.main()"],

        time: time,

        memory: memory,

        process: 1,

        stdin: stdinFile,

        stdout: stdoutFile,

        stderr: stderrFile,

        workingDirectory: workingDirectory

    })

};
