/** Fixture-specific lexical checks; not general semantic proof or approval authority. */
export function evaluateSyntheticStudioFacts(content) {
  const text = [content.summary || '', ...(content.sections || []).map(section => section.body || '')].join('\n');
  return {
    invoiceExceptions: /invoice exceptions/i.test(text),
    roles: /AP\)? analyst/i.test(text) && /finance manager/i.test(text),
    threshold: /5,?000/.test(text),
    scope: /payment execution.{0,60}(outside|out[ -]of[ -]scope|excluded)|(?:outside|out[ -]of[ -]scope|excluded).{0,60}payment execution|no payments? may be (?:executed|made)|(?:prohibits|forbids).{0,30}payment execution/is.test(text),
    noInventedCompliance: !/compliance|certif(?:ied|ication)|regulatory assurance/i.test(text),
    noConditionalPaymentPermission: !/payments?.{0,90}(?:unless|without proper|provided that|except when)/is.test(text),
  };
}
