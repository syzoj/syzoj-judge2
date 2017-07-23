import * as fse from 'fs-extra';
import { Language, languages } from './languages';
import { compareStringByNumber, tryReadFile, filterPath } from './utils';
import * as path from 'path';
import * as yaml from 'js-yaml';

export enum SubtaskScoringType {
    Summation,
    Minimum,
    Multiple
}

export interface TestCaseJudge {
    input: string;
    output?: string;
    // TODO: replace userAnswer to userOutput globally.
    userAnswer?: string;
}

export interface SubtaskJudge {
    type: SubtaskScoringType;
    score: number;
    cases: TestCaseJudge[];
}

export interface Executable {
    language: Language;
    sourceCode: string;
}

export interface TestData {
    path: string;
    subtasks: SubtaskJudge[];
    spj?: Executable;
    interactor?: Executable;
    extraSourceFiles?: { [language: string]: FileContent[] };
}

export interface UserSubtask {
    score: number;
    type: string;
    cases: (string | number)[];
}

export interface FileContent {
    content: string,
    name: string
}

export interface UserConfigFile {
    subtasks: UserSubtask[];
    inputFile: string;
    outputFile?: string;
    userOutput?: string;
    specialJudge?: { language: string, fileName: string };
    interactor?: { language: string, fileName: string };
    extraSourceFiles?: { language: string, files: { name: string, dest: string }[] }[];
}

function filterHyphen(input: string): string {
    if (input === null || input === '-')
        return null;
    else
        return input;
}

function parseScoringType(typeString: string): SubtaskScoringType {
    if (typeString === 'sum')
        return SubtaskScoringType.Summation;
    else if (typeString === 'mul')
        return SubtaskScoringType.Multiple;
    else if (typeString === 'min')
        return SubtaskScoringType.Minimum;
    throw new Error("Subtask type must be one of the following: sum, mul, min");
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

            subtasks.push({
                type: parseScoringType(typeString),
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

async function parseExecutable(src: any, dataPath: string): Promise<Executable> {
    return { sourceCode: await fse.readFile(path.join(dataPath, filterPath(src.fileName)), 'utf8'), language: languages.find(l => l.name === src.language) };
}

async function parseYamlContent(obj: UserConfigFile, dataPath: string): Promise<TestData> {
    let extraFiles: { [language: string]: FileContent[] } = {};
    if (obj.extraSourceFiles) {
        for (let l of obj.extraSourceFiles) {
            extraFiles[l.language] = [];
            for (let f of l.files) {
                extraFiles[l.language].push({
                    name: filterPath(f.dest),
                    content: await fse.readFile(path.join(dataPath, filterPath(f.name)), 'utf8')
                })
            }
        }
    }
    return {
        subtasks: obj.subtasks.map(s => ({
            score: s.score,
            type: parseScoringType(s.type),
            cases: s.cases.map(c => ({
                input: obj.inputFile ? filterPath(obj.inputFile.replace('#', c.toString())) : null,
                output: obj.outputFile ? filterPath(obj.outputFile.replace('#', c.toString())) : null,
                userAnswer: obj.userOutput ? filterPath(obj.userOutput.replace('#', c.toString())) : null,
            }))
        })),
        spj: obj.specialJudge && await parseExecutable(obj.specialJudge, dataPath),
        extraSourceFiles: extraFiles,
        interactor: obj.interactor && await parseExecutable(obj.interactor, dataPath),
        path: dataPath
    }
}

export async function readRulesFile(dataPath: string): Promise<TestData> {

    let fileContent: string;

    if (fileContent = await tryReadFile(path.join(dataPath, 'data.yml'))) {
        return parseYamlContent(yaml.safeLoad(fileContent), dataPath);
    } else {
        let spj: Executable = null;
        for (const lang of languages) {
            const spjName = path.join(dataPath, "spj_" + lang.name + "." + lang.fileExtension);
            if (await fse.exists(spjName)) {
                spj = { sourceCode: await fse.readFile(spjName, 'utf8'), language: lang };
                break;
            }
        }
        if (fileContent = await tryReadFile(path.join(dataPath, 'data_rule.txt'))) {
            return {
                subtasks: parseRules(fileContent),
                spj: spj,
                path: dataPath
            };
        } else {
            let cases: { input: string, output: string, filePrefix: string }[] = [];
            for (let fileName of await fse.readdir(dataPath)) {
                let outputFileName = null;

                const fileNameRegex = /^(.*)\.in$/;
                const matchResult = fileNameRegex.exec(fileName);
                if (matchResult !== null) {
                    const filePrefix = matchResult[1];
                    if ((await fse.stat(dataPath + '/' + fileName)).isFile()) {
                        const outputPathPrefix = dataPath + '/' + filePrefix;
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
                spj: spj,
				path: dataPath,
				extraSourceFiles: {}
            };
        }
    }
}
