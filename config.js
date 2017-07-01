const myName = 'gg';

module.exports = {
    workingDirectory: "/sandbox",
    syzoj_url: "http://127.0.0.1:5283",
    judge_token: "233",
    testDataDirectory: "testdata",
    delay: 1000,
    outputLimit: 104857600,
    stderrDisplayLimit: 5120,
    dataDisplayLimit: 128,
    compilerMessageLimit: 50000,
    spjTimeLimit: 1500,
    spjMemoryLimit: 256,
    fullScore: 100,
    sandbox: {
        chroot: '/ubuntu',
        mountProc: true,
        redirectBeforeChroot: false,
        user: "nobody",
        cgroup: "syzoj-" + myName,
        environments: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME=/tmp"]
    },
}
