import { SPECIAL_LABEL } from './notices';
import INCOME_CRITERIA from '../data/income-criteria.json';

export { INCOME_CRITERIA };

/**
 * 기존 내집매칭(asis) HTML 의 "내 조건 입력 → 자격 확인" 로직을 옮겨 왔다.
 *
 * 옮기면서 고친 것 두 가지.
 *  1) `incomeLimit: null` 은 "소득 제한 없음/공고문 확인" 이라는 뜻인데 예전 코드는
 *     `incomePct > null` 비교(= 0원 제한)로 취급해서 기관추천·노부모부양·일반공급이
 *     전부 탈락했다. 실데이터 40건에서는 이 값이 대부분이라 결과가 늘 0건이었다.
 *  2) 마감일이 없는 공고(12건)에서 날짜 계산이 깨지던 부분. 날짜 판단은 목록 쪽
 *     status 로 일원화하고 여기서는 자격만 본다.
 *
 * 자동으로 확정할 수 없는 조건(기관추천 대상 여부, 소득 기준 미기재)은 탈락시키지 않고
 * `uncertain` 으로 표시해서 "확인 필요"로 보여 준다.
 */

/**
 * 가구원수별 도시근로자 가구당 월평균소득 기준.
 * 공고문에 실린 표를 그대로 옮긴 src/data/income-criteria.json 이 단일 출처다.
 *
 * 표에 찍힌 1·2인 가구 금액에는 +20%p·+10%p 가산이 이미 반영돼 있다.
 * 반면 공고의 incomeLimit 은 160·70 같은 순수 퍼센트라서, 가산을 기준액에 섞으면
 * 이중 계산이 된다. 그래서 여기서는 가산을 걷어낸 100% 기준액을 만들고,
 * 가산은 incomeLimitFor() 로 한도 쪽에 붙인다 — 실제 제도와 같은 순서다.
 */
const TIER_100 = INCOME_CRITERIA.tiers.find((t) => t.percent === 100);

/** 가산이 걷힌 순수 100% 기준액 (원). 6인 이상은 5인 금액에 1인당 평균금액을 더한다. */
function baselineWon(household) {
  const n = Math.max(1, Math.floor(Number(household) || 1));
  const table = TIER_100.amountByHouseholdSize;
  const printed = n <= 5 ? table[String(n)] : table['5'] + TIER_100.perPersonAddFrom6 * (n - 5);
  return printed / (1 + incomeAllowance(n) / 100);
}

/** 화면·판정이 만원 단위를 쓰므로 만원으로 환산해 돌려준다 */
export function baselineIncome(household) {
  return Math.round(baselineWon(household) / 10_000);
}

/** 1인 가구 +20%p, 2인 가구 +10%p — 소득기준 자체에 가산된다 */
export function incomeAllowance(household) {
  const n = Math.max(1, Math.floor(Number(household) || 1));
  return INCOME_CRITERIA.householdAdjustment[String(n)]?.addPercentPoint ?? 0;
}

/** 공고에 적힌 소득기준(%)에 가구원수 가산을 얹은 실제 한도 */
export function incomeLimitFor(household, limitPercent) {
  return limitPercent + incomeAllowance(household);
}

export const MARITAL_OPTIONS = [
  { value: '미혼', label: '미혼' },
  { value: '예비', label: '예비 신혼부부 (혼인신고 전)' },
  { value: '신혼7', label: '신혼부부 (혼인 7년 이내)' },
  { value: '기혼7초과', label: '혼인 7년 초과 / 기혼' },
];

/** 자녀 수를 묻는 혼인 상태 — 미혼이면 묻지 않는다 */
export const MARRIED_STATES = new Set(['예비', '신혼7', '기혼7초과']);
export const isMarried = (profile) => MARRIED_STATES.has(profile.marital);

/**
 * 거주지·소득 근거지 선택지.
 * 공고 데이터의 region 이 서울/경기/인천 세 값뿐이라 시·도 단위로 맞춘다.
 */
export const REGION_OPTIONS = [
  { value: '서울', label: '서울특별시' },
  { value: '경기', label: '경기도' },
  { value: '인천', label: '인천광역시' },
  { value: '기타', label: '그 외 지역' },
];

/**
 * 공공주택 특별공급 자산기준 (2026년 가정치, 단위: 만원).
 * 공고문에 자산기준이 실려 있지 않아 LH·SH 공고에 공통 규칙으로 적용한다.
 */
export const ASSET_LIMIT = { total: 34_500, car: 3_900 };

/**
 * 민영주택 청약 예치금 기준 — 전용 85㎡ 이하 (단위: 만원).
 * 공고 데이터에 주택형별 면적이 없어 85㎡ 이하를 가정한다.
 */
export const DEPOSIT_BASELINE = { 서울: 300, 인천: 250, 경기: 200, 기타: 200 };

/** 공공분양 일반공급에서 납입 인정 횟수를 보는 최소 기준 */
export const PUBLIC_MIN_SUB_COUNT = 24;

const num = (v) => Number(v) || 0;

export const DEFAULT_PROFILE = {
  age: 34,
  household: 3,
  marital: '신혼7',
  children: 1,
  subMonths: 30,
  income: 580,
  noHouse: true,
  firstHome: true,
  parentSupport: false,
  newborn: false, // 2년 이내 출생 자녀 (신생아 특별공급)

  // 거주지 · 소득 근거지 — 해당지역 우선공급 판단에 쓴다
  residence: '경기',
  incomeBase: '경기',

  // 총자산 (단위: 만원)
  assetRealty: 0,
  assetCar: 0,
  assetFinance: 0,
  assetEtc: 0,

  // 청약통장
  subCount: 30, // 납입 인정 횟수
  subTotal: 300, // 납입 총액 (만원)

  // 월평균 소득 계산기 입력 — 연소득 기준 (만원)
  incomeSelf: 0,
  incomeSpouse: 0,
  incomeOther: 0,
};

export function createProfile() {
  return { ...DEFAULT_PROFILE };
}

export function incomePercent(profile) {
  const base = baselineIncome(profile.household);
  return Math.round((num(profile.income) / base) * 100);
}

/** 부동산 + 자동차 + 금융 + 일반자산 (만원) */
export function totalAssets(profile) {
  return num(profile.assetRealty) + num(profile.assetCar) + num(profile.assetFinance) + num(profile.assetEtc);
}

/** 계산기: 연소득 합계 ÷ 12 → 월평균 소득 (만원) */
export function monthlyFromAnnual(profile) {
  const annual = num(profile.incomeSelf) + num(profile.incomeSpouse) + num(profile.incomeOther);
  return Math.round(annual / 12);
}

export const isPublicSupply = (notice) => notice.agency === 'LH' || notice.agency === 'SH';

export function depositBaseline(region) {
  return DEPOSIT_BASELINE[region] ?? DEPOSIT_BASELINE.기타;
}

/**
 * 해당지역 우선공급 순위.
 * 거주지가 같으면 해당지역, 소득 근거지(직장)만 같으면 그다음, 나머지는 기타지역.
 * 신청 자체를 막지는 않으므로 탈락 사유가 아니라 참고 정보로만 돌려준다.
 */
export function localPriority(profile, notice) {
  if (profile.residence === notice.region) return { key: 'local', label: '해당지역 (1순위 우선공급)' };
  if (profile.incomeBase === notice.region) return { key: 'work', label: '소득 근거지 일치 (지역 우선 가능)' };
  return { key: 'other', label: '기타지역' };
}

/** 유형별 조건 검사. 통과하면 null, 막히면 사유 문자열을 돌려준다. */
function typeBlocker(sp, profile) {
  switch (sp.type) {
    case '신혼부부':
      return profile.marital === '예비' || profile.marital === '신혼7'
        ? null
        : `혼인 ${sp.maxMarriageYears ?? 7}년 이내 (예비 신혼부부 포함)`;
    case '신생아':
      return profile.newborn ? null : '2년 이내 출생 자녀';
    case '생애최초':
      return profile.firstHome ? null : '생애 최초 주택 구입';
    case '다자녀':
      return profile.children >= (sp.minChildren || 2) ? null : `자녀 ${sp.minChildren || 2}명 이상`;
    case '노부모부양':
      return profile.parentSupport ? null : '만 65세 이상 직계존속 3년 이상 부양';
    case '청년':
      return profile.age >= (sp.minAge || 19) && profile.age <= (sp.maxAge || 39)
        ? null
        : `만 ${sp.minAge || 19}~${sp.maxAge || 39}세`;
    default:
      return null;
  }
}

/**
 * 결과 등급 — 카드/마커에 한 단어로 붙이려고 나눠 둔다.
 *  special : 특별공급 자격이 확실히 하나 이상
 *  check   : 특별공급 후보는 있는데 기관추천·소득 미기재라 확인이 필요
 *  general : 일반공급만 가능
 *  no      : 통장/연령에 막히거나 해당 유형 없음
 */
export const TIER_LABEL = {
  special: '특별공급 가능',
  check: '자격 확인 필요',
  general: '일반공급 가능',
  no: '조건 미충족',
};

/**
 * @returns {{
 *   ok: boolean,
 *   tier: 'special'|'check'|'general'|'no',
 *   tierLabel: string,
 *   matched: Array<{type:string,label:string,note:string,uncertain:boolean}>,
 *   missed: Array<{type:string,label:string,reason:string}>,
 *   blockers: string[],
 *   incomePct: number,
 * }}
 */
export function evaluate(notice, profile) {
  const pct = incomePercent(profile);
  const matched = [];
  const missed = [];
  const blockers = [];

  const isPublic = isPublicSupply(notice);
  const assets = totalAssets(profile);
  const region = localPriority(profile, notice);
  const allowance = incomeAllowance(profile.household);

  // 공고 단위 조건 — 통장 가입기간·신청 연령은 유형과 무관하게 먼저 막힌다.
  if (notice.minSubMonths && (Number(profile.subMonths) || 0) < notice.minSubMonths) {
    blockers.push(`청약통장 ${notice.minSubMonths}개월 이상 필요 (내 조건 ${Number(profile.subMonths) || 0}개월)`);
  }
  if (notice.minAge && (Number(profile.age) || 0) < notice.minAge) {
    blockers.push(`만 ${notice.minAge}세 이상 신청 가능`);
  }

  // 민영주택은 지역별 예치금을 채워야 1순위가 된다 (전용 85㎡ 이하 기준).
  if (!isPublic) {
    const need = depositBaseline(notice.region);
    if (num(profile.subTotal) < need) {
      blockers.push(`${notice.region} 예치금 ${need}만원 이상 필요 (내 통장 ${num(profile.subTotal)}만원 · 85㎡ 이하 기준)`);
    }
  } else if (num(profile.subCount) < PUBLIC_MIN_SUB_COUNT) {
    // 공공분양은 가입기간과 별개로 납입 인정 횟수를 본다.
    blockers.push(`공공분양 납입 인정 ${PUBLIC_MIN_SUB_COUNT}회 이상 권장 (내 통장 ${num(profile.subCount)}회)`);
  }

  // 공공주택 특별공급 자산기준 — 초과하면 특별공급만 막히고 일반공급은 남는다.
  const overAsset = isPublic && assets > ASSET_LIMIT.total;
  const overCar = isPublic && num(profile.assetCar) > ASSET_LIMIT.car;

  for (const sp of notice.special ?? []) {
    const label = SPECIAL_LABEL[sp.type] ?? sp.type;

    if (sp.requiresNoHouse && !profile.noHouse) {
      missed.push({ type: sp.type, label, reason: '무주택 세대구성원 요건' });
      continue;
    }

    if (sp.type !== '일반공급' && (overAsset || overCar)) {
      missed.push({
        type: sp.type,
        label,
        reason: overAsset
          ? `총자산 ${assets.toLocaleString()}만원 > 기준 ${ASSET_LIMIT.total.toLocaleString()}만원`
          : `자동차 ${num(profile.assetCar).toLocaleString()}만원 > 기준 ${ASSET_LIMIT.car.toLocaleString()}만원`,
      });
      continue;
    }

    const blocked = typeBlocker(sp, profile);
    if (blocked) {
      missed.push({ type: sp.type, label, reason: blocked });
      continue;
    }

    // 소득 기준이 적혀 있는 유형만 숫자로 검사한다. null 은 "공고문 확인".
    // 한도에는 1·2인 가구 가산(+20%p·+10%p)을 얹는다.
    const limit = sp.incomeLimit != null ? incomeLimitFor(profile.household, sp.incomeLimit) : null;
    if (limit != null && pct > limit) {
      missed.push({ type: sp.type, label, reason: `소득 ${pct}% > 기준 ${limit}%` });
      continue;
    }

    const uncertain = sp.type === '기관추천' || sp.incomeLimit == null;
    const note =
      sp.type === '기관추천'
        ? '기관 추천 대상 여부는 해당 기관에 확인 필요'
        : sp.incomeLimit == null
          ? '소득 기준 미기재 — 공고문 확인 필요'
          : `소득 ${pct}% ≤ 기준 ${limit}%${allowance ? ` (${profile.household}인 가구 +${allowance}%p 가산)` : ''}`;

    matched.push({ type: sp.type, label, note, uncertain });
  }

  const specials = matched.filter((m) => m.type !== '일반공급');
  let tier = 'no';
  if (blockers.length === 0 && matched.length > 0) {
    if (specials.some((m) => !m.uncertain)) tier = 'special';
    else if (specials.length) tier = 'check';
    else tier = 'general';
  }

  return {
    ok: tier !== 'no',
    tier,
    tierLabel: TIER_LABEL[tier],
    matched,
    missed,
    blockers,
    incomePct: pct,
    /** 해당지역 우선공급 여부 — 탈락 사유가 아니라 참고 정보 */
    region,
    assets,
    isPublic,
  };
}

/** 전체 공고에 대한 매칭 결과 Map(id -> result) */
export function evaluateAll(notices, profile) {
  const out = new Map();
  for (const n of notices) out.set(n.id, evaluate(n, profile));
  return out;
}
