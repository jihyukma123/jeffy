# Agent Loop 실행 이벤트

## 배경

Agent Loop는 다음 과정을 반복한다.

```text
모델 호출 -> 도구 호출 판단 -> 도구 실행 -> 결과 추가 -> 모델 재호출 -> 최종 응답
```

기존 구현은 도구 호출 지점에서 직접 콘솔을 출력했다. 이 방식은 도구 실행은 볼 수 있지만, 현재 모델 호출이 몇 번째 turn인지 또는 언제 최종 응답으로 종료되었는지를 하나의 흐름으로 관찰하기 어렵다. 또한 Agent Loop가 출력 방법까지 결정하게 된다.

## 구현

`runAgent()`가 실행 중 발생한 일을 `AgentEvent`로 알리도록 `onEvent` 옵션을 추가했다.

```text
model_start
  -> model_end
  -> tool_start
  -> tool_end
  -> 다음 turn의 model_start
  -> model_end
  -> final
```

- `model_start`: 모델 호출 직전이며 입력 item 수를 포함한다.
- `model_end`: 모델 응답 직후이며 출력 item 수와 텍스트 길이를 포함한다.
- `tool_start`: 도구 실행 직전이며 `callId`, 도구 이름, 인자를 포함한다.
- `tool_end`: 도구 실행 직후이며 결과의 문자 수를 포함한다.
- `final`: 도구 호출이 없는 모델 응답으로 Loop가 종료될 때 발생한다.

turn 번호는 사람이 실행 로그를 읽기 쉽도록 1부터 시작한다.

## 책임 분리

이벤트의 생성과 표현은 서로 다른 책임이다.

```text
Agent Loop       -> 실행 사실을 구조화된 이벤트로 전달
CLI              -> 이벤트를 사람이 읽을 수 있는 콘솔 로그로 표현
테스트/다른 UI   -> 같은 이벤트를 각 용도에 맞게 사용
```

`runAgent()`는 더 이상 `console.error()`를 직접 호출하지 않는다. CLI인 `minimal_agent.ts`가 `onEvent`를 구독해서 로그를 출력한다. 따라서 Agent Loop를 CLI가 아닌 웹 UI나 테스트에서도 출력 방식에 의존하지 않고 재사용할 수 있다.

## 의도적으로 넣지 않은 것

최소 설계를 유지하기 위해 다음 기능은 아직 추가하지 않았다.

- 이벤트 영구 저장
- 실행 시간 측정
- 비동기 이벤트 처리
- 별도 로깅 라이브러리

현재 `onEvent`는 동기 콜백이다. 실행 과정을 관찰하는 가장 작은 계약을 먼저 학습하기 위한 선택이다.

## 검증

`agent-loop.test.ts`에서 가짜 모델과 가짜 도구를 사용해 이벤트가 다음 순서로 발생하는지 검증한다.

```text
turn 1: model_start -> model_end -> tool_start -> tool_end
turn 2: model_start -> model_end -> final
```

이 테스트는 실제 모델이나 네트워크 없이 Agent Loop의 제어 흐름만 결정적으로 확인한다.
