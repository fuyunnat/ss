import type { Policy } from './types';

type CopyText = (zh: string, en: string) => string;

export function policyMatchOptions(copyText: CopyText) {
  return [
    { value: 'default', label: copyText('全部流量', 'All traffic') },
    { value: 'domain', label: copyText('指定域名', 'Specific domains') },
    { value: 'user', label: copyText('指定用户', 'Specific users') },
    { value: 'region', label: copyText('指定地区', 'Specific regions') },
    { value: 'cidr', label: copyText('指定 IP 段', 'Specific IP ranges') },
  ];
}

export function policyStrategyOptions(copyText: CopyText) {
  return [
    { value: 'health_weighted', label: copyText('自动选择健康出口', 'Auto healthy exits') },
    { value: 'weighted', label: copyText('按权重分配', 'Weighted routing') },
    { value: 'fixed', label: copyText('固定到指定出口', 'Pinned exits') },
    { value: 'cost_first', label: copyText('优先低成本出口', 'Lowest-cost first') },
  ];
}

export function policyMatchMeta(type: string, copyText: CopyText) {
  const map: Record<string, { label: string; hint: string; valueLabel: string; placeholder: string }> = {
    default: {
      label: copyText('全部流量', 'All traffic'),
      hint: copyText('这条规则会作用于所有入口流量。', 'This rule applies to all inbound traffic.'),
      valueLabel: copyText('匹配内容', 'Match Value'),
      placeholder: '*',
    },
    domain: {
      label: copyText('指定域名', 'Specific domains'),
      hint: copyText('只有命中域名的流量会使用这条规则。', 'Only traffic matching the domain uses this rule.'),
      valueLabel: copyText('域名', 'Domain'),
      placeholder: '*.google.com',
    },
    user: {
      label: copyText('指定用户', 'Specific users'),
      hint: copyText('只有指定用户或订阅会使用这条规则。', 'Only selected users or subscriptions use this rule.'),
      valueLabel: copyText('用户标识', 'User ID'),
      placeholder: 'user-001',
    },
    region: {
      label: copyText('指定地区', 'Specific regions'),
      hint: copyText('按用户或入口地区匹配流量。', 'Match traffic by user or entry region.'),
      valueLabel: copyText('地区', 'Region'),
      placeholder: 'HK',
    },
    cidr: {
      label: copyText('指定 IP 段', 'Specific IP ranges'),
      hint: copyText('按目标 IP 段匹配流量。', 'Match traffic by destination IP range.'),
      valueLabel: copyText('IP 段', 'IP Range'),
      placeholder: '8.8.8.0/24',
    },
  };
  return map[type] ?? { label: type, hint: copyText('保留原始匹配类型用于兼容。', 'Raw match type kept for compatibility.'), valueLabel: copyText('匹配内容', 'Match Value'), placeholder: '' };
}

export function policyStrategyMeta(strategy: string, copyText: CopyText) {
  const option = policyStrategyOptions(copyText).find((item) => item.value === strategy);
  return option ?? { value: strategy, label: strategy };
}

export function policyMatchSummary(policy: Policy, copyText: CopyText) {
  const meta = policyMatchMeta(policy.matchType, copyText);
  if (policy.matchType === 'default') {
    return meta.label;
  }
  return `${meta.label}: ${policy.matchValue || '-'}`;
}
