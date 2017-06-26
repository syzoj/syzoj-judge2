import * as rp from 'request-promise';
import * as url from 'url';
import { config } from './config';
import * as fse from 'fs-extra';
import * as Bluebird from 'bluebird';

export interface JudgeTask {
    have_task: number;
    judge_id: number;
    code: string;
    language: string;
    testdata: string;
    time_limit: number;
    memory_limit: number;
    file_io: boolean;
    file_io_input_name: string;
    file_io_output_name: string;
}

export async function getJudgeTask(): Promise<JudgeTask> {
    let task: JudgeTask;
    do {
        try {
            task = (await rp({
                uri: url.resolve(config.syzoj_url, '/api/waiting_judge'),
                qs: {
                    'session_id': config.judge_token
                },
                json: true,
                jar: true
            })) as any as JudgeTask;
        } catch (e) { }

        await Bluebird.delay(config.delay);
    } while (!task || task.have_task === 0);

    return task;
}

export async function uploadJudgeResult(task: JudgeTask, result: any) {
    return await rp({
        uri: url.resolve(config.syzoj_url, '/api/update_judge/' + task.judge_id),
        method: 'POST',
        body: {
            result: JSON.stringify(result)
        },
        qs: {
            session_id: config.judge_token
        },
        json: true,
        jar: true
    });
}
