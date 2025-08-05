/**
 * 入力値検証ユーティリティ
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * トリガー文字列の検証
 */
export function validateTrigger(trigger: string): ValidationResult {
  const errors: string[] = [];

  if (!trigger) {
    errors.push('トリガー文字列は必須です');
  } else {
    if (trigger.length < 1) {
      errors.push('トリガー文字列は1文字以上である必要があります');
    }
    if (trigger.length > 10) {
      errors.push('トリガー文字列は10文字以下である必要があります');
    }
    if (trigger.includes(' ')) {
      errors.push('トリガー文字列にスペースを含めることはできません');
    }
    // 特殊文字のチェック（基本的な文字と記号のみ許可）
    const validPattern = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;
    if (!validPattern.test(trigger)) {
      errors.push('トリガー文字列に使用できない文字が含まれています');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 検索エンジンの検証
 */
export function validateSearchEngine(engine: string): ValidationResult {
  const validEngines = ['google', 'bing'];
  const errors: string[] = [];

  if (!validEngines.includes(engine)) {
    errors.push('無効な検索エンジンです');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * テーマの検証
 */
export function validateTheme(theme: string): ValidationResult {
  const validThemes = ['light', 'dark', 'system'];
  const errors: string[] = [];

  if (!validThemes.includes(theme)) {
    errors.push('無効なテーマです');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 検索クエリの検証
 */
export function validateSearchQuery(query: string): ValidationResult {
  const errors: string[] = [];

  if (!query) {
    errors.push('検索クエリは必須です');
  } else {
    if (query.length > 1000) {
      errors.push('検索クエリが長すぎます');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * URLの検証
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];

  if (!url) {
    errors.push('URLは必須です');
  } else {
    try {
      new URL(url);
    } catch {
      errors.push('無効なURL形式です');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
