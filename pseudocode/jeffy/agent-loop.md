# 모델 호출과 도구 실행 반복

실제 코드: [jeffy/agent-loop.ts](../../jeffy/agent-loop.ts)

`runAgent()`는 현재 대화를 모델 입력으로 만들고, 도구 호출이 있으면 실행 결과를 붙여 모델을 다시 호출합니다.

**입력과 출력**

- 입력: 텍스트 대화 `messages`, 모델 호출 함수 `callModel`, 도구 실행 함수 `executeTool`, 선택적인 `maximumTurns`.
- 출력: 도구 호출이 없는 모델 응답의 `outputText`.
- 사용하는 함수: 전달받은 두 함수와 tool calling의 `isToolCall()`.

```text
runAgent(messages, 설정):
    inputItems = messages를 모델 입력 형식으로 변환한다
        user 메시지 → role=user, content=input_text
        assistant 메시지 → role=assistant, content=output_text

    최대 반복 횟수 = 설정.maximumTurns 또는 20

    최대 반복 횟수만큼 반복:
        응답 = 설정.callModel(inputItems)

        inputItems에 응답.output 전체를 추가한다
        도구 호출들 = 응답.output에서 isToolCall인 항목을 찾는다

        도구 호출이 없으면:
            응답.outputText를 반환한다

        각 도구 호출을 순서대로 처리:
            호출 이름, 호출 ID, 인자를 로그로 출력한다
                인자를 JSON으로 읽을 수 있으면 해석해서 표시한다
                읽을 수 없으면 원래 문자열을 표시한다

            결과 = 설정.executeTool(도구 호출)
            호출 ID, 도구 이름, 결과의 글자 수를 로그로 출력한다

            inputItems에 다음 항목을 추가한다:
                type = function_call_output
                call_id = 해당 도구 호출의 call_id
                output = 결과

        // 늘어난 inputItems로 다음 반복에서 모델을 다시 호출한다

    최대 반복 횟수를 넘었다는 오류를 발생시킨다
```

모델 출력 전체를 먼저 추가하고, 이어서 도구 결과를 추가합니다. `call_id`로 어떤 호출의 결과인지 연결합니다. 도구 호출이 여러 개라면 순서대로 모두 실행한 뒤 모델을 다시 호출합니다.

`inputItems`는 이번 요청 동안의 작업 기록입니다. 이 함수는 세션 파일을 읽거나 저장하지 않습니다.
