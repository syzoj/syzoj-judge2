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
    problem_type: string;
}

export interface SubmitAnswerTask {
    answer_file: string;
    testdata: string;
}

export async function getJudgeTask(): Promise<any> {
    let task: any;
    do {
        try {
            task = (await rp({
                uri: url.resolve(config.webUrl, '/api/waiting_judge'),
                qs: {
                    'session_id': config.webToken
                },
                method: 'POST',
                json: true,
                jar: true
            })) as any;
        } catch (e) { console.log(e); }

        await Bluebird.delay(config.delay);
    } while (!task || task.have_task === 0);

    return task;
}

export async function uploadJudgeResult(task: JudgeTask, result: any) {
    return await rp({
        uri: url.resolve(config.webUrl, '/api/update_judge/' + task.judge_id),
        method: 'POST',
        body: {
            result: JSON.stringify(result)
        },
        qs: {
            session_id: config.webToken
        },
        json: true,
        jar: true
    });
}

export async function downloadUserAnswer(id: string): Promise<Buffer> {
    return await rp({
        uri: url.resolve(config.webUrl, '/static/uploads/answer/' + id),
        method: 'GET',
        encoding: null
    });
}
