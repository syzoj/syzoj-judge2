import { JudgeTask } from './syzoj';
import { compile } from './compile';
import { config as Config } from './config';
import { createOrEmptyDir, readFileLength, tryEmptyDir } from './utils';
import { languages, Language } from './languages';
import { runProgram, runDiff } from './run';
import * as fse from 'fs-extra';
import * as _ from 'lodash';
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
    JudgementFailed
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

const tempErrFile = "~user.err";

export async function judge(task: JudgeTask, reportProgress: (p: JudgeResult) => Promise<void>):
    Promise<JudgeResult> {

    const language = languages.find(l => l.name === task.language);


    const testDataPath = Config.testDataDirectory + '/' + task.testdata;
    const testData = await readRulesFile(testDataPath);
    if (testData === null) {
        return { status: StatusType.NoTestdata };
    }
    const useSpj = testData.spjLanguage !== null;

    const binDir = `${Config.workingDirectory}/bin`;
    const spjBinDir = `${Config.workingDirectory}/spj-bin`;
    const workingDir = `${Config.workingDirectory}/data`;
    const spjWorkingDir = `${Config.workingDirectory}/data-spj`;
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
        if (useSpj) {
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

        const judgeResult: JudgeResult = {
            status: StatusType.Running,
            subtasks: testData.subtasks.map(t => ({ status: StatusType.Waiting, score: 0, case_num: t.cases.length, testcases: [] }))
        };

        for (let subtaskIndex = 0; subtaskIndex < testData.subtasks.length; subtaskIndex++) {
            const currentSubtaskResult = judgeResult.subtasks[subtaskIndex];
            const subtask = testData.subtasks[subtaskIndex];
            currentSubtaskResult.status = StatusType.Running;
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

                await createOrEmptyDir(workingDir);
                let stdin, stdout, outputFileName;
                const inputFilePath = testDataPath + '/' + testcase.input;
                const answerFilePath = testDataPath + '/' + testcase.output;
                if (task.file_io) {
                    stdin = null;
                    stdout = null;
                    outputFileName = task.file_io_output_name;
                    await fse.copy(inputFilePath,
                        workingDir + '/' + task.file_io_input_name);
                } else {
                    stdin = "data.in";
                    stdout = "data.out";
                    outputFileName = stdout;
                    await fse.copy(inputFilePath,
                        workingDir + '/' + stdin);
                }
                currentCaseSubmit.input = await readFileLength(inputFilePath, Config.dataDisplayLimit);
                currentCaseSubmit.answer = await readFileLength(answerFilePath, Config.dataDisplayLimit);

                await reportProgress(judgeResult);
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
                // TODO: This is a complete mess. Please reduce the complexity of this part.
                if (currentCaseSubmit.status === StatusType.Running) {
                    await fse.copy(answerFilePath, spjWorkingDir + '/answer');
                    if (useSpj) {
                        await fse.copy(testDataPath + '/' + testcase.input, spjWorkingDir + '/input');
                        await fse.writeFile(spjWorkingDir + '/code', task.code);
                        const spjRunResult = await runProgram(testData.spjLanguage,
                            spjBinDir,
                            spjWorkingDir,
                            Config.spjTimeLimit,
                            Config.spjMemoryLimit * 1024 * 1024,
                            null,
                            'score.txt',
                            'message.txt');

                        if (spjRunResult.result.status !== SandboxStatus.OK) {
                            currentCaseSubmit.status = StatusType.JudgementFailed;
                            currentCaseSubmit.spjMessage = `Special Judge ${SandboxStatus[spjRunResult.result.status]} encouneted.`;
                        } else {
                            const scoreString = await fse.readFile(spjWorkingDir + '/score.txt'),
                                score = Number(scoreString);
                            const messageString = await readFileLength(spjWorkingDir + '/message.txt', Config.dataDisplayLimit);

                            if (score === NaN) {
                                currentCaseSubmit.status = StatusType.JudgementFailed;
                                currentCaseSubmit.spjMessage = `Special Judge returned a non-number score: ${scoreString}.`;
                            } else {
                                currentCaseSubmit.score = score;
                                switch (currentCaseSubmit.score) {
                                    case Config.fullScore:
                                        currentCaseSubmit.status = StatusType.Accepted;
                                        break;
                                    case 0:
                                        currentCaseSubmit.status = StatusType.WrongAnswer;
                                        break;
                                    default:
                                        currentCaseSubmit.status = StatusType.PartiallyCorrect;
                                        break;
                                }
                                currentCaseSubmit.spjMessage = messageString;
                            }
                        }
                    } else {
                        const diffResult = await runDiff(spjWorkingDir, 'user_out', 'answer');
                        currentCaseSubmit.score = diffResult.pass ? Config.fullScore : 0;
                        currentCaseSubmit.status = diffResult.pass ? StatusType.Accepted : StatusType.WrongAnswer;
                        currentCaseSubmit.spjMessage = diffResult.message;
                    }
                }

                let scores = currentSubtaskResult.testcases.map(t => t.score);

                let currentScore = 0;
                if (subtask.type === SubtaskScoringType.Minimum) {
                    if (scores.length === subtask.cases.length) {
                        currentScore = 100;
                        for (let i = 0; i < subtask.cases.length; i++) {
                            currentScore = Math.min(currentScore, scores[i]);
                        }
                    }
                } else if (subtask.type === SubtaskScoringType.Multiple) {
                    if (scores.length === subtask.cases.length) {
                        currentScore = 1;
                        for (let i = 0; i < subtask.cases.length; i++) {
                            if (i >= scores.length) continue;
                            currentScore = currentScore * (scores[i] / Config.fullScore);
                        }
                        currentScore *= Config.fullScore;
                    }
                } else if (subtask.type === SubtaskScoringType.Summation) {
                    currentScore = 0;
                    for (let i = 0; i < scores.length; i++) {
                        currentScore += scores[i] / subtask.cases.length;
                    }
                }

                currentSubtaskResult.score = currentScore / Config.fullScore * subtask.score;
            }

        }
        return judgeResult;
    } finally {
        tryEmptyDir(workingDir);
        tryEmptyDir(spjWorkingDir);
    }
}
