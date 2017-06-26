const myName = 'gg';

module.exports = {
    workingDirectory: "/mnt/syzoj-tmp",
    syzoj_url: "http://127.0.0.1:5283",
    judge_token: "233",
    testDataDirectory: "/home/t123yh/judge/testdata",
    delay: 1000,
    outputLimit: 104857600,
    dataDisplayLimit: 10000,
    compilerMessageLimit: 50000,
    spjTimeLimit: 1500,
    spjMemoryLimit: 256,
    fullScore: 100,
    sandbox: {
        chroot: '/home/t123yh/alpine',
        mountProc: true,
        redirectBeforeChroot: false,
        user: "nobody",
        cgroup: "syzoj-" + myName,
        environments: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"]
    },
}