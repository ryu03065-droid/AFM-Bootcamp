---
name: quick-dinner-recipe
description: 사용자가 저녁 메뉴, 15분 안에 만들 수 있는 요리, 간단한 한 끼 레시피를 요청할 때 사용하세요. 레시피를 마크다운으로 작성하고 fal.ai로 생성한 완성 요리 썸네일을 최상단에 넣습니다. "저녁 뭐 먹지", "간단한 요리 추천", "15분 레시피" 같은 요청에 적극적으로 사용하세요.
---

# Quick Dinner Recipe Skill

바쁜 사람도 15분 안에 만들 수 있는 저녁 레시피를 작성하고, fal.ai로 생성한 완성 요리 사진을 레시피 최상단에 넣는 스킬입니다.

## 준비물: fal.ai API 키

썸네일 생성에는 fal.ai(`fal-ai/flux/schnell` 모델)를 사용합니다.

1. https://fal.ai/dashboard/keys 에서 키를 발급받으세요
2. 터미널에서 `export FAL_KEY="발급받은_키"` 로 설정하세요 (영구 설정하려면 `~/.zshrc` 또는 `~/.bashrc`에 추가)

키가 없으면 3단계 스크립트가 안내 메시지와 함께 멈추지만, 레시피 본문(.md)은 그대로 작성됩니다. API 키는 채팅에 붙여넣지 말고 항상 환경변수로만 다루세요.

## 작업 흐름

### 1단계: 요청 파악
- 사용자가 가진 재료나 원하는 메뉴 스타일이 있는지 확인하세요
- 특별히 언급이 없으면 흔한 재료로 만들 수 있는 인기 저녁 메뉴를 제안하세요
- 식이 제한이나 선호도가 언급되면 반영하세요

### 2단계: 레시피 작성
- 조리 시간 15분 이내로 완성 가능한 요리만 선택하세요
- 특수 장비(오븐, 에어프라이어 등)가 꼭 필요한 요리는 제안하지 마세요
- 기본 양념(간장, 소금, 설탕, 식용유, 후추, 참기름)은 있다고 가정하세요
- 1인분 기준으로 재료 양을 계산하세요

### 3단계: 썸네일 생성 — fal.ai 직접 호출

완성된 요리의 식욕을 돋우는 사실적인 사진을 fal.ai로 생성합니다. `FAL_PROMPT`(영문 푸드 포토그래피 프롬프트)와 `FAL_OUTPUT`(저장 경로)만 이번 레시피에 맞게 바꿔서 아래 명령을 그대로 실행하세요.

**저장 위치는 항상 "스킬을 실행한 현재 작업 디렉토리" 기준입니다.** 시작 전 `pwd`로 위치를 확인하고, 모든 결과물을 그 아래 `recipes/`, `recipes/thumbnails/`에만 저장하세요.

```bash
FAL_PROMPT="A delicious bowl of kimchi fried rice topped with a fried egg and chopped scallions, top-down food photography, warm natural lighting, rustic wooden table, appetizing and vibrant, square 1:1 composition" \
FAL_OUTPUT="recipes/thumbnails/kimchi-fried-rice.png" \
python3 - <<'PY'
import json, os, sys, urllib.request, urllib.error

key = os.environ.get("FAL_KEY")
if not key:
    sys.exit("⚠️  FAL_KEY 환경변수가 없습니다. https://fal.ai/dashboard/keys 에서 키를 발급받아 `export FAL_KEY=\"...\"` 후 다시 실행하세요. (레시피 .md는 이미 만들어졌습니다)")

out = os.environ["FAL_OUTPUT"]
model = "fal-ai/flux/schnell"
body = json.dumps({
    "prompt": os.environ["FAL_PROMPT"],
    "image_size": "square_hd",
    "num_images": 1,
}).encode()
req = urllib.request.Request(
    f"https://fal.run/{model}",
    data=body,
    headers={"Content-Type": "application/json", "Authorization": f"Key {key}"},
)
try:
    res = json.loads(urllib.request.urlopen(req, timeout=180).read())
except urllib.error.HTTPError as e:
    sys.exit(f"⚠️  fal.ai 요청 실패 ({e.code}): {e.read().decode()[:300]}")

images = res.get("images", [])
if not images:
    sys.exit(f"⚠️  이미지가 반환되지 않았습니다: {json.dumps(res)[:300]}")

os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
urllib.request.urlretrieve(images[0]["url"], out)
print("✅ 썸네일 저장:", out)
PY
```

프롬프트 작성 요령:
- 요리 이름 + 플레이팅/가니시 디테일을 영어로 구체적으로 작성하세요
- `top-down or 45-degree angle food photography, warm natural lighting, appetizing` 류의 표현을 항상 포함하세요
- 정사각형 썸네일을 원하면 `square 1:1 composition`을 프롬프트에 명시하세요
- 결과물 경로는 마크다운에서 참조하는 경로(`recipes/thumbnails/{recipe-name}.png`)와 정확히 일치해야 합니다

### 4단계: 마크다운 파일 저장

- `recipes/` 디렉토리가 없으면 생성하세요 (현재 폴더 기준)
- 파일명: 레시피 이름을 소문자와 하이픈으로 (예: `kimchi-fried-rice.md`)
- 아래 구조를 그대로 따르세요:

```markdown
![thumbnail](./thumbnails/{recipe-name}.png)

# {레시피 이름}

> ⏱️ 조리시간: {X}분 | 🍽️ 1인분 | 난이도: ⭐ 쉬움

## 📝 재료
- {재료 1} — {양}
- {재료 2} — {양}
...

## 👨‍🍳 만드는 법
1. {단계 1}
2. {단계 2}
...

## 💡 꿀팁
- {설거지 줄이는 팁}
- {재료 대체 가능 옵션}
```

### 5단계: 완료 보고
- 저장된 마크다운/썸네일 경로를 알려주세요
- FAL_KEY가 없어서 썸네일 생성이 실패한 경우, 안내 메시지를 그대로 사용자에게 전달하세요

## 중요 규칙
1. 썸네일 이미지 참조는 반드시 `![thumbnail](./thumbnails/{recipe-name}.png)` 형식이어야 합니다
2. 레시피와 썸네일은 **현재 작업 디렉토리(`pwd`) 기준** `recipes/`, `recipes/thumbnails/`에 저장합니다
3. 썸네일은 fal.ai(`fal-ai/flux/schnell`)로 생성합니다
4. 모든 레시피는 15분 이내로 완성 가능해야 하며, 특수 장비 없이 만들 수 있어야 합니다
5. FAL_KEY를 코드나 파일에 하드코딩하지 마세요 — 항상 환경변수로만 참조하세요
