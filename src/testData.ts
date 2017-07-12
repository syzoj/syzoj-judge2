import * as fse from 'fs-extra';
import { Language, languages } from './languages';
import { compareStringByNumber } from './utils';

export enum SubtaskScoringType {
    Summation,
    Minimum,
    Multiple
}

export interface TestCaseJudge {
    input: string;
    output: string;
    userAnswer?: string;
}

export interface SubtaskJudge {
    type: SubtaskScoringType;
    score: number;
    cases: TestCaseJudge[];
}

export interface TestData {
    path: string;
    subtasks: SubtaskJudge[];
    spjLanguage?: Language;
}

function filterHyphen(input: string): string {
    if (input === null || input === '-')
        return null;
    else
        return input;
}

export function parseRules(content: string): SubtaskJudge[] {
    // Something like sum:1 2 3 is acceptable for both haveSubtask and noSubtask,
    // so we match haveSubtask first.

    const haveSubtaskJudge = /^((?:(?:sum|min|mul):\d+\.?\d* +(?:\S+ +)*\S+ *(?:\r?\n)+)+)(?:\r?\n)*(.+?)\s*(?:\r?\n)+(.+?)\s*(?:\r?\n)*(?:(?:\r?\n)+(.+))?$/g;
    const match_haveSubTask = haveSubtaskJudge.exec(content);
    if (match_haveSubTask) {
        const subtaskRegex = /(sum|min|mul):(\d+\.?\d*) +((?:\S+ )*\S+) *(?:\r?\n)+/g;
        const inputFileName = match_haveSubTask[2];
        const outputFileName = match_haveSubTask[3];
        const answerFileName = match_haveSubTask[4] != undefined ? match_haveSubTask[4] : '-';
        const subtasks: SubtaskJudge[] = [];
        let subtaskMatch: RegExpExecArray;
        while ((subtaskMatch = subtaskRegex.exec(match_haveSubTask[1])) !== null) {
            let type: SubtaskScoringType;
            const typeString = subtaskMatch[1];
            if (typeString === 'sum')
                type = SubtaskScoringType.Summation;
            else if (typeString === 'mul')
                type = SubtaskScoringType.Multiple;
            else if (typeString === 'min')
                type = SubtaskScoringType.Minimum;

            subtasks.push({
                type: type,
                score: Number(subtaskMatch[2]),
                cases: subtaskMatch[3].split(' ')
                    .map(s => ({
                        input: filterHyphen(inputFileName.replace('#', s)),
                        output: filterHyphen(outputFileName.replace('#', s)),
                        userAnswer: filterHyphen(answerFileName.replace('#', s))
                    }))
            });
        }

        return subtasks;
    }

    const noSubtaskJudge = /^\n*((?:\S+ +)*\S+) *(?:\r?\n)+(.+?)\s*(?:\r?\n)+(.+)\s*(?:\r?\n)*(.+)?(?:\r?\n)*$/g;
    const match_NoSubtaskJudge = noSubtaskJudge.exec(content);
    if (match_NoSubtaskJudge !== null) {
        const inputFileName = match_NoSubtaskJudge[2];
        const outputFileName = match_NoSubtaskJudge[3];
        const answerFileName = match_NoSubtaskJudge[4] != undefined ? match_NoSubtaskJudge[4] : '-';
        const subtask: SubtaskJudge = {
            type: SubtaskScoringType.Summation,
            score: 100,
            cases: match_NoSubtaskJudge[1].split(' ').filter(v => v.trim() != '')
                .map(s => ({
                    input: filterHyphen(inputFileName.replace('#', s)),
                    output: filterHyphen(outputFileName.replace('#', s)),
                    userAnswer: filterHyphen(answerFileName.replace('#', s))
                }))
        };
        return [subtask];
    }
    throw new Error("Unable to parse rules file!");
}


export async function readRulesFile(path: string): Promise<TestData> {
    let fileContent: string;
    try {
        fileContent = await fse.readFile(path + "/data_rule.txt", 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            fileContent = null;
        } else {
            throw e;
        }
    }

    let spjLanguage: Language = null;
    for (const lang of languages) {
        if (await fse.exists(path + "/spj_" + lang.name + "." + lang.fileExtension)) {
            spjLanguage = lang;
            break;
        }
    }

    if (fileContent !== null) {
        return {
            subtasks: parseRules(fileContent),
            spjLanguage: spjLanguage,
            path: path
        };
    } else {
        let cases: { input: string, output: string, filePrefix: string }[] = [];
        for (let fileName of await fse.readdir(path)) {
            let outputFileName = null;

            const fileNameRegex = /^(.*)\.in$/;
            const matchResult = fileNameRegex.exec(fileName);
            if (matchResult !== null) {
                const filePrefix = matchResult[1];
                if ((await fse.stat(path + '/' + fileName)).isFile()) {
                    const outputPathPrefix = path + '/' + filePrefix;
                    if (await fse.exists(outputPathPrefix + '.out')) {
                        outputFileName = filePrefix + '.out';
                    } else if (await fse.exists(outputPathPrefix + '.ans')) {
                        outputFileName = filePrefix + '.ans';
                    }
                }
                // Found output file
                if (outputFileName !== null) {

                    cases.push({
                        input: filePrefix + '.in',
                        output: outputFileName,
                        filePrefix: filePrefix
                    });
                }
            }
        }

        cases.sort((a, b) => compareStringByNumber(a.filePrefix, b.filePrefix));

        return cases.length === 0 ? null : {
            subtasks: [{
                score: 100,
                type: SubtaskScoringType.Summation,
                cases: cases
            }],
            spjLanguage: spjLanguage,
            path: path
        };
    }

}