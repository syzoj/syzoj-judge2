import { getJudgeTask, uploadJudgeResult, downloadUserAnswer } from './syzoj';
import { judgeStandard, judgeSubmitAnswer, StatusType, TestCaseSubmit, SubtaskSubmit, JudgeResult, statusToString } from './judge';
import * as _ from 'lodash';

function convertJudgeResult(input: JudgeResult) {
    let result = {
        status: statusToString[input.status],
        score: 0,
        total_time: 0,
        max_memory: 0,
        pending: false,
        compiler_output: '',
        spj_compiler_output: '',
        subtasks: []
    }
    if (input.subtasks && input.subtasks.length > 0) {
        result.max_memory = _.max(input.subtasks.map(s => _.max(s.testcases.map(t => t.memory))));
        result.total_time = _.sum(input.subtasks.map(s => _.sum(s.testcases.map(t => t.time))));

        result.score = Math.round(_.sum(input.subtasks.map(val => val.score)));
        result.subtasks = input.subtasks.map(val => {
            let result;
            if (val.testcases.length > 0) {
                const isPending = val.testcases.some(t => t.pending);
                result = {
                    status: '',
                    pending: isPending,
                    score: Math.round(val.score),
                    case_num: val.case_num,
                };
                if (!isPending) {
                    // If all accepted
                    if (val.testcases.every(c => c.status === StatusType.Accepted)) {
                        result.status = statusToString[StatusType.Accepted];
                    } else {
                        const firstNonAC = val.testcases.find(c => c.status !== StatusType.Accepted);
                        result.status = statusToString[firstNonAC.status];
                    }
                } else {
                    const running = val.testcases.find(c => c.pending);
                    result.runningTaskId = running.id;
                    result.status = `Running on #${running.id}`;
                }
                for (const testcase of val.testcases) {
                    if (testcase.status !== StatusType.Running) {
                        result[testcase.id - 1] = {
                            status: statusToString[testcase.status],
                            time_used: testcase.time,
                            memory_used: testcase.memory,
                            input: testcase.input,
                            user_out: testcase.userOutput,
                            answer: testcase.answer,
                            score: Math.round(testcase.score),
                            user_err: testcase.userError,
                            spj_message: testcase.spjMessage
                        };
                    }
                }
            } else {
                if (val.status === StatusType.Waiting) {
                    result = {
                        status: statusToString[StatusType.Waiting],
                        pending: true,
                        score: 0,
                        case_num: val.case_num
                    };
                } else {
                    result = {
                        status: 'No testcases',
                        pending: false,
                        score: 0,
                        case_num: 0
                    }
                }
            }

            return result;
        });
    }


    switch (input.status) {
        case StatusType.CompilationError:
            result.compiler_output = input.compilationErrorMessage;
            break;

        case StatusType.Compiling:
            result.pending = true;
            break;

        case StatusType.JudgementFailed:
            if (input.compilationErrorMessage) {
                result.spj_compiler_output = input.compilationErrorMessage;
            }
            break;

        default:
            // If running, the status will be overwritten
            if (result.subtasks.every(s => s.status === statusToString[StatusType.Accepted])) {
                result.status = statusToString[StatusType.Accepted];
            } else {
                result.status = result.subtasks.find(s => s.status !== statusToString[StatusType.Accepted]).status;
            }
            break;
    }

    const runningIndex = result.subtasks.findIndex(t => t.runningTaskId != undefined);
    if (runningIndex !== -1) {
        result.status = result.subtasks.length === 1 ? `Running on #${result.subtasks[runningIndex].runningTaskId}` : `Running on #${runningIndex + 1}.${result.subtasks[runningIndex].runningTaskId}`;
        result.pending = true;
    }

    return result;
}

(async function () {
    while (true) {
        const task = await getJudgeTask();
        console.log("Got judge task: " + JSON.stringify(task));
        try {
            let result;
            if (task.problem_type === 'submit-answer') {
                const userData = await downloadUserAnswer(task.answer_file);
                result = await judgeSubmitAnswer(task, userData, async result => {
                    // let uploadResult = await uploadJudgeResult(task, result);
                    await uploadJudgeResult(task, convertJudgeResult(result));
                });
            } else {
                result = await judgeStandard(task, async result => {
                    // let uploadResult = await uploadJudgeResult(task, result);
                    await uploadJudgeResult(task, convertJudgeResult(result));
                });
            }
            const fr = convertJudgeResult(result);
            console.log("Final: " + JSON.stringify(fr));
            await uploadJudgeResult(task, fr);
        } catch (e) {
            await uploadJudgeResult(task, {
                status: "System Error",
                score: 0,
                total_time: 0,
                max_memory: 0,
                case_num: 0,
                pending: false
            });
            console.log(e);
        }
    }
})().then(() => { process.exit(0); }, (err) => { console.log(err); process.exit(1); });
