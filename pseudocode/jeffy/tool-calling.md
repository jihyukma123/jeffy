# 도구 정의와 실제 실행

실제 코드: [jeffy/tool-calling.ts](../../jeffy/tool-calling.ts)

이 모듈에는 모델에 알려줄 도구 설명과 실제로 실행할 코드가 함께 있습니다. 현재 도구는 작업 폴더 안의 텍스트 파일을 읽는 `read_file` 하나입니다.

**입력과 출력**

- 생성 입력: 작업 폴더. 생략하면 현재 실행 폴더.
- 생성 출력: `{ tools, executeTool }`.
- 실행 입력: `ToolCall`.
- 실행 출력: 파일 내용 문자열 또는 오류를 담은 JSON 문자열.

```text
ToolDefinition = 도구 이름, 설명, 입력 형식, strict 설정
ToolCall = {
    type: function_call,
    call_id: 호출을 구분하는 문자열,
    name: 도구 이름,
    arguments: JSON 문자열
}

isToolCall(모델 출력 항목):
    type이 function_call이고,
    call_id, name, arguments가 모두 문자열인지 반환한다

createToolCallingSystem(작업 폴더):
    tools = [
        read_file:
            설명 = 작업 폴더 안의 UTF-8 텍스트 파일 읽기
            입력 = { path: 문자열 }
            path는 필수이며 추가 속성은 허용하지 않음
            strict = true
    ]

    executeTool(호출):
        try:
            인자 = 호출.arguments를 JSON으로 해석한다

            호출.name이 read_file이면:
                readFileTool(인자, 작업 폴더)의 결과를 반환한다
            그 외 이름이면:
                알 수 없는 도구라는 오류를 발생시킨다

        catch 오류:
            { error: 오류 메시지 }를 JSON 문자열로 반환한다

    { tools, executeTool }을 반환한다

readFileTool(인자, 작업 폴더):
    인자가 객체이고 path가 문자열인지 확인한다
    맞지 않으면 오류를 발생시킨다

    작업 폴더의 실제 경로를 구한다
    요청한 path를 작업 폴더 기준으로 해석한다
    대상 파일의 실제 경로를 구한다

    대상이 작업 폴더 밖에 있으면 오류를 발생시킨다

    파일을 UTF-8로 읽고 내용을 반환한다
```

`tools`의 입력 형식은 모델에 전달하는 설명입니다. 실제 실행 시에는 `JSON.parse()`와 `readFileTool()`의 검사가 수행됩니다. `isToolCall()`은 호출 항목의 형태를 확인합니다.

도구 오류는 `executeTool()`에서 문자열 결과로 바뀝니다. agent loop는 이 문자열도 호출 결과로 모델에 전달합니다. 도구 이름을 고르는 주체는 모델이고, 이름에 맞는 함수를 실행하는 주체는 이 모듈입니다.
