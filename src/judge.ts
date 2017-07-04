import { JudgeTask, SubmitAnswerTask } from './syzoj';
import { compile } from './compile';
import { config as Config } from './config';
import { createOrEmptyDir, readFileLength, tryEmptyDir } from './utils';
import { languages, Language } from './languages';
import { runProgram, runDiff } from './run';
import * as fse from 'fs-extra';
import * as _ from 'lodash';
import * as decompress from 'decompress';
import { SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { TestData, TestCaseJudge, SubtaskJudge, SubtaskScoringType, readRulesFile } from './testData';

export enum StatusType {
    Compiling,
    CompilationError,
    Accepted,
    WrongAnswer,
    PartiallyCorrect,
    MemoryLimitExceeded,
    TimeLimitExceeded,
    OutputLimitExceeded,
    NoTestdata,
    Running,
    // The output file does not exist
    FileError,
    RuntimeError,
    Waiting,
    JudgementFailed,
    Skipped
}

export interface TestCaseSubmit {
    id: number;
    status: StatusType;
    pending: boolean;
    time: number;
    memory: number;
    input: string;
    userOutput: string;
    answer: string;
    score: number;
    userError: string;
    spjMessage: string;
}

export interface SubtaskSubmit {
    testcases?: TestCaseSubmit[];
    case_num?: number;
    status: StatusType;
    score: number;
}

export interface JudgeResult {
    status: StatusType;
    compilationErrorMessage?: string;
    subtasks?: SubtaskSubmit[];
}

export const statusToString = {};
statusToString[StatusType.Compiling] = "Compiling";
statusToString[StatusType.CompilationError] = "Compile Error";
statusToString[StatusType.Accepted] = "Accepted";
statusToString[StatusType.WrongAnswer] = "Wrong Answer";
statusToString[StatusType.PartiallyCorrect] = "Partially Correct";
statusToString[StatusType.MemoryLimitExceeded] = "Memory Limit Exceeded";
statusToString[StatusType.TimeLimitExceeded] = "Time Limit Exceeded";
statusToString[StatusType.OutputLimitExceeded] = "Output Limit Exceeded";
statusToString[StatusType.RuntimeError] = "Runtime Error";
statusToString[StatusType.FileError] = "File Error";
statusToString[StatusType.NoTestdata] = "No Testdata";
statusToString[StatusType.JudgementFailed] = "Judgement Failed";
statusToString[StatusType.Running] = "Running";
statusToString[StatusType.Waiting] = "Waiting";
statusToString[StatusType.Skipped] = "Skipped";

const tempErrFile = "~user.err";

const binDir = `${Config.workingDirectory}/bin`;
const spjBinDir = `${Config.workingDirectory}/spj-bin`;
const workingDir = `${Config.workingDirectory}/data`;
const spjWorkingDir = `${Config.workingDirectory}/data-spj`;

interface SpjResult {
    status: StatusType;
    message: string;
    score: number;
}

async function runSpj(spjLanguage: Language): Promise<SpjResult> {
    const spjRunResult = await runProgram(spjLanguage,
        spjBinDir,
        spjWorkingDir,
        Config.spjTimeLimit,
        Config.spjMemoryLimit * 1024 * 1024,
        null,
        'score.txt',
        'message.txt');

    if (spjRunResult.result.status !== SandboxStatus.OK) {
        return {
            status: StatusType.JudgementFailed,
            message: `Special Judge ${SandboxStatus[spjRunResult.result.status]} encouneted.`,
            score: 0
        };
    } else {
        const scoreString = await fse.readFile(spjWorkingDir + '/score.txt'),
            score = Number(scoreString);
        const messageString = await readFileLength(spjWorkingDir + '/message.txt', Config.dataDisplayLimit);

        if (score === NaN) {
            return {
                status: StatusType.JudgementFailed,
                message: `Special Judge returned a non-number score: ${scoreString}.`,
                score: 0
            };
        } else {
            let status: StatusType;
            switch (score) {
                case Config.fullScore:
                    status = StatusType.Accepted;
                    break;
                case 0:
                    status = StatusType.WrongAnswer;
                    break;
                default:
                    status = StatusType.PartiallyCorrect;
                    break;
            }
            return {
                status: status,
                message: messageString,
                score: score
            };
        }
    }
}

async function judgeTestCaseSubmitAnswer(testcase: TestCaseJudge,
    testDataPath: string,
    currentCaseSubmit: TestCaseSubmit,
    task: SubmitAnswerTask,
    spjLanguage: Language): Promise<void> {

    const inputFilePath = testcase.input !== null ?
        testDataPath + '/' + testcase.input : null;
    const answerFilePath = testcase.output !== null ?
        testDataPath + '/' + testcase.output : null;
    const userAnswerFilePath = testcase.userAnswer !== null ?
        workingDir + '/' + testcase.userAnswer : null;

    if (inputFilePath !== null)
        currentCaseSubmit.input = await readFileLength(inputFilePath, Config.dataDisplayLimit);

    if (answerFilePath !== null)
        currentCaseSubmit.answer = await readFileLength(answerFilePath, Config.dataDisplayLimit);

    currentCaseSubmit.userOutput = await readFileLength(userAnswerFilePath, Config.dataDisplayLimit);
    currentCaseSubmit.pending = false;
    currentCaseSubmit.time = 0;
    currentCaseSubmit.memory = 0;

    await createOrEmptyDir(spjWorkingDir);
    try {
        console.log("UserAnswer: " + userAnswerFilePath);
        await fse.move(userAnswerFilePath, spjWorkingDir + '/user_out');
    } catch (e) {
        if (e.code === 'ENOENT') {
            currentCaseSubmit.status = StatusType.FileError;
        }
    }

    if (currentCaseSubmit.status === StatusType.Running) {
        if (answerFilePath !== null)
            await fse.copy(answerFilePath, spjWorkingDir + '/answer');
        if (spjLanguage !== null) {
            if (inputFilePath !== null)
                await fse.copy(inputFilePath, spjWorkingDir + '/input');
            const spjResult = await runSpj(spjLanguage);
            currentCaseSubmit.score = spjResult.score;
            currentCaseSubmit.status = spjResult.status;
            currentCaseSubmit.spjMessage = spjResult.message;
        } else {
            const diffResult = await runDiff(spjWorkingDir, 'user_out', 'answer');
            currentCaseSubmit.score = diffResult.pass ? Config.fullScore : 0;
            currentCaseSubmit.status = diffResult.pass ? StatusType.Accepted : StatusType.WrongAnswer;
            currentCaseSubmit.spjMessage = diffResult.message;
        }
    }
}
async function judgeTestCaseStandard(testcase: TestCaseJudge,
    testDataPath: string,
    currentCaseSubmit: TestCaseSubmit,
    task: JudgeTask,
    language: Language,
    spjLanguage: Language): Promise<void> {

    await createOrEmptyDir(workingDir);
    let stdin, stdout, outputFileName;
    const inputFilePath = testcase.input !== null ?
        testDataPath + '/' + testcase.input : null;
    const answerFilePath = testcase.output !== null ?
        testDataPath + '/' + testcase.output : null;

    if (task.file_io) {
        stdin = null;
        stdout = null;
        outputFileName = task.file_io_output_name;

        if (inputFilePath !== null)
            await fse.copy(inputFilePath,
                workingDir + '/' + task.file_io_input_name);
    } else {
        stdout = "data.out";
        outputFileName = stdout;

        if (inputFilePath !== null) {
            stdin = "data.in";
            await fse.copy(inputFilePath,
                workingDir + '/' + stdin);
        } else {
            stdin = null;
        }
    }

    if (inputFilePath !== null)
        currentCaseSubmit.input = await readFileLength(inputFilePath, Config.dataDisplayLimit);

    if (answerFilePath !== null)
        currentCaseSubmit.answer = await readFileLength(answerFilePath, Config.dataDisplayLimit);

    currentCaseSubmit.pending = false;

    const runResult = await runProgram(language,
        binDir,
        workingDir,
        task.time_limit,
        task.memory_limit * 1024 * 1024,
        stdin,
        stdout,
        tempErrFile);

    console.log(testcase.input + " Run result: " + JSON.stringify(runResult));

    currentCaseSubmit.time = Math.round(runResult.result.time / 1e6);
    currentCaseSubmit.memory = runResult.result.memory / 1024;

    if (runResult.outputLimitExceeded) {
        currentCaseSubmit.status = StatusType.OutputLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.TimeLimitExceeded) {
        currentCaseSubmit.status = StatusType.TimeLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.MemoryLimitExceeded) {
        currentCaseSubmit.status = StatusType.MemoryLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.RuntimeError) {
        currentCaseSubmit.status = StatusType.RuntimeError;
    } else if (runResult.result.status !== SandboxStatus.OK) {
        currentCaseSubmit.status = StatusType.RuntimeError;
    }

    currentCaseSubmit.userError = await readFileLength(workingDir + '/' + tempErrFile, Config.stderrDisplayLimit);
    currentCaseSubmit.userOutput = await readFileLength(workingDir + '/' + outputFileName, Config.dataDisplayLimit);

    await createOrEmptyDir(spjWorkingDir);
    try {
        await fse.move(workingDir + '/' + outputFileName, spjWorkingDir + '/user_out');
    } catch (e) {
        if (e.code === 'ENOENT' && runResult.result.status === SandboxStatus.OK) {
            currentCaseSubmit.status = StatusType.FileError;
        }
    }

    await tryEmptyDir(workingDir);
    if (currentCaseSubmit.status === StatusType.Running) {
        if (answerFilePath !== null)
            await fse.copy(answerFilePath, spjWorkingDir + '/answer');
        if (spjLanguage !== null) {
            if (inputFilePath !== null)
                await fse.copy(inputFilePath, spjWorkingDir + '/input');
            await fse.writeFile(spjWorkingDir + '/code', task.code);
            const spjResult = await runSpj(spjLanguage);
            currentCaseSubmit.score = spjResult.score;
            currentCaseSubmit.status = spjResult.status;
            currentCaseSubmit.spjMessage = spjResult.message;
        } else {
            const diffResult = await runDiff(spjWorkingDir, 'user_out', 'answer');
            currentCaseSubmit.score = diffResult.pass ? Config.fullScore : 0;
            currentCaseSubmit.status = diffResult.pass ? StatusType.Accepted : StatusType.WrongAnswer;
            currentCaseSubmit.spjMessage = diffResult.message;
        }
    }
}

function calculateSubtaskScore(scoring: SubtaskScoringType, scores: number[], caseNum: number): number {
    if (scoring === SubtaskScoringType.Minimum) {
        if (scores.length !== caseNum) {
            return 0;
        } else {
            return _.min(scores);
        }
    } else if (scoring === SubtaskScoringType.Multiple) {
        if (scores.length !== caseNum) {
            return 0;
        } else {
            return _.reduce(scores,
                (res, cur) => res * (cur / Config.fullScore), 1) * Config.fullScore;
        }
    } else if (scoring === SubtaskScoringType.Summation) {
        return _.sum(scores) / caseNum;
    }
}

async function processJudgement(subtasks: SubtaskJudge[],
    reportProgress: (p: JudgeResult) => Promise<void>,
    judgeTestCase: (curCase: TestCaseJudge, currentCaseSubmit: TestCaseSubmit) => Promise<void>)
    : Promise<JudgeResult> {

    const judgeResult: JudgeResult = {
        status: StatusType.Running,
        subtasks: subtasks.map(t => ({ status: StatusType.Waiting, score: 0, case_num: t.cases.length, testcases: [] }))
    };

    for (let subtaskIndex = 0; subtaskIndex < subtasks.length; subtaskIndex++) {
        const currentSubtaskResult = judgeResult.subtasks[subtaskIndex];
        const subtask = subtasks[subtaskIndex];
        currentSubtaskResult.status = StatusType.Running;
        let skipCurrent = false;
        for (let index = 0; index < subtask.cases.length; index++) {
            const testcase = subtask.cases[index];
            const currentCaseSubmit = {
                id: index + 1,
                status: StatusType.Running,
                pending: true,
                time: 0,
                memory: 0,
                input: '',
                userOutput: '',
                userError: '',
                score: 0,
                spjMessage: '',
                answer: '',
            };
            currentSubtaskResult.testcases.push(currentCaseSubmit);
            if (!skipCurrent) {
                await reportProgress(judgeResult);
                await judgeTestCase(testcase, currentCaseSubmit);
                if ([SubtaskScoringType.Minimum, SubtaskScoringType.Multiple].includes(subtask.type)
                    && currentCaseSubmit.score === 0) {
                    skipCurrent = true;
                }
            } else {
                currentCaseSubmit.status = StatusType.Skipped;
                currentCaseSubmit.pending = false;
            }
            const scores = currentSubtaskResult.testcases.map(t => t.score);
            currentSubtaskResult.score = calculateSubtaskScore(subtask.type, scores, subtask.cases.length) / Config.fullScore * subtask.score;
        }
    }
    return judgeResult;
}

export async function judgeStandard(task: JudgeTask, reportProgress: (p: JudgeResult) => Promise<void>):
    Promise<JudgeResult> {
    const language = languages.find(l => l.name === task.language);
    const testDataPath = Config.testDataDirectory + '/' + task.testdata;
    const testData = await readRulesFile(testDataPath);
    if (testData === null) {
        return { status: StatusType.NoTestdata };
    }

    await createOrEmptyDir(binDir);

    try {
        await reportProgress({ status: StatusType.Compiling });
        const compilationResult = await compile(task.code, language, binDir);
        if (!compilationResult.ok) {
            return {
                status: StatusType.CompilationError,
                compilationErrorMessage: compilationResult.message
            };
        }
        if (testData.spjLanguage !== null) {
            await createOrEmptyDir(spjBinDir);
            const spjCode = await fse.readFile(testDataPath + '/spj_' + testData.spjLanguage.name + '.' + testData.spjLanguage.fileExtension, 'utf8');
            const spjCompilationResult = await compile(spjCode, testData.spjLanguage, spjBinDir);
            if (!spjCompilationResult.ok) {
                return {
                    status: StatusType.JudgementFailed,
                    compilationErrorMessage: spjCompilationResult.message
                };
            }
        }
        const judgeResult = processJudgement(testData.subtasks, reportProgress, async (curCase, curCaseSubmit) => {
            await judgeTestCaseStandard(curCase, testDataPath, curCaseSubmit, task, language, testData.spjLanguage);
        })

        return judgeResult;
    } finally {
        tryEmptyDir(workingDir);
        tryEmptyDir(spjWorkingDir);
    }
}

export async function judgeSubmitAnswer(task: SubmitAnswerTask, userData: Buffer, reportProgress: (p: JudgeResult) => Promise<void>) {
    const testDataPath = Config.testDataDirectory + '/' + task.testdata;
    const testData = await readRulesFile(testDataPath);
    if (testData === null) {
        return { status: StatusType.NoTestdata };
    }

    try {
        await createOrEmptyDir(workingDir);
        await decompress(userData, workingDir);

        if (testData.spjLanguage !== null) {
            await createOrEmptyDir(spjBinDir);
            await reportProgress({ status: StatusType.Compiling });
            const spjCode = await fse.readFile(testDataPath + '/spj_' + testData.spjLanguage.name + '.' + testData.spjLanguage.fileExtension, 'utf8');
            const spjCompilationResult = await compile(spjCode, testData.spjLanguage, spjBinDir);
            if (!spjCompilationResult.ok) {
                return {
                    status: StatusType.JudgementFailed,
                    compilationErrorMessage: spjCompilationResult.message
                };
            }
        }

        const judgeResult = await processJudgement(testData.subtasks, reportProgress, async (curCase, curCaseSubmit) => {
            await judgeTestCaseSubmitAnswer(curCase, testDataPath, curCaseSubmit, task, testData.spjLanguage);
        });

        return judgeResult;
    } finally {
        await tryEmptyDir(spjBinDir);
        await tryEmptyDir(spjWorkingDir);
        await tryEmptyDir(workingDir);
    }
}