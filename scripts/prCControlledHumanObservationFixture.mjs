const fail = code => { throw new Error(code); };

const timestamp = (value, code) => {
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(parsed)) fail(code);
  return parsed;
};

const stepKey = (checkpointId, stepId) => `${checkpointId}\0${stepId}`;

export function createControlledHumanObservationFixture({
  orderedSteps,
  machineStepKeys,
  postQuiesceStepKeys = [],
  expectedExerciseDigest,
  expectedScopeDigest,
  exerciseStartedAt,
  captureAbsence,
  waitForServerTimeAfter,
}) {
  if (!Array.isArray(orderedSteps) || orderedSteps.length === 0
    || !(machineStepKeys instanceof Set)
    || typeof captureAbsence !== 'function'
    || typeof waitForServerTimeAfter !== 'function') fail('PR_C_CH_OBSERVATION_FIXTURE_CONFIGURATION_REJECTED');
  const normalized = orderedSteps.map(step => ({ checkpointId:step.checkpointId, stepId:step.stepId, personaKey:step.personaKey }));
  const keys = normalized.map(step => stepKey(step.checkpointId, step.stepId));
  if (new Set(keys).size !== keys.length || [...machineStepKeys].some(key => !keys.includes(key)))
    fail('PR_C_CH_OBSERVATION_FIXTURE_CONFIGURATION_REJECTED');
  const postQuiesce = new Set(postQuiesceStepKeys);
  if ([...postQuiesce].some(key => !keys.includes(key) || machineStepKeys.has(key)))
    fail('PR_C_CH_OBSERVATION_FIXTURE_CONFIGURATION_REJECTED');
  const exerciseStarted = timestamp(exerciseStartedAt, 'PR_C_CH_OBSERVATION_FIXTURE_EXERCISE_TIME_REJECTED');
  const records = new Map();
  let cursor = exerciseStarted - 1;
  let position = 0;
  let preparedMachineKey = null;
  let pendingMachineKey = null;

  const validateClockWitness = (witness, minimum, code) => {
    const observed = timestamp(witness?.serverObservedAt, `${code}_CLOCK_REJECTED`);
    if (observed <= minimum) fail(`${code}_CLOCK_REJECTED`);
    return observed;
  };

  const captureUnbound = async step => {
    const key = stepKey(step.checkpointId, step.stepId);
    const expectedPhase = postQuiesce.has(key) ? 'read_only' : 'active';
    const witness = await captureAbsence({ ...step, after:cursor, expectedPhase });
    if (!witness || witness.checkpointId !== step.checkpointId || witness.stepId !== step.stepId
      || witness.exerciseDigest !== expectedExerciseDigest || witness.scopeDigest !== expectedScopeDigest)
      fail('PR_C_CH_OBSERVATION_FIXTURE_FOREIGN_REJECTED');
    if (witness.phase !== expectedPhase) fail('PR_C_CH_OBSERVATION_FIXTURE_PHASE_REJECTED');
    if (!Number.isSafeInteger(witness.blockedActivityCount) || witness.blockedActivityCount !== 0
      || !Number.isSafeInteger(witness.foreignActivityCount) || witness.foreignActivityCount !== 0)
      fail('PR_C_CH_OBSERVATION_FIXTURE_ACTIVITY_REJECTED');
    if (typeof witness.stateDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(witness.stateDigest))
      fail('PR_C_CH_OBSERVATION_FIXTURE_STATE_REJECTED');
    const started = timestamp(witness.startedAt, 'PR_C_CH_OBSERVATION_FIXTURE_TIME_REJECTED');
    const completed = timestamp(witness.completedAt, 'PR_C_CH_OBSERVATION_FIXTURE_TIME_REJECTED');
    const observed = timestamp(witness.serverObservedAt, 'PR_C_CH_OBSERVATION_FIXTURE_TIME_REJECTED');
    if (started < exerciseStarted || started <= cursor || completed <= started || completed > observed)
      fail('PR_C_CH_OBSERVATION_FIXTURE_TIME_REJECTED');
    const record = Object.freeze({ started, completed, anchorAt:null, bindingAt:null, bindingToken:null });
    records.set(key, record);cursor = completed;position += 1;
    return record;
  };

  const drainUnboundBeforeMachineStep = async (checkpointId, stepId) => {
    const requestedKey = stepKey(checkpointId, stepId);
    if (!machineStepKeys.has(requestedKey) || pendingMachineKey || preparedMachineKey)
      fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
    while (position < normalized.length) {
      const step = normalized[position];const key = keys[position];
      if (machineStepKeys.has(key)) {
        if (key !== requestedKey) fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
        preparedMachineKey = key;
        return;
      }
      await captureUnbound(step);
    }
    fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
  };

  const beforeMachineStep = async (checkpointId, stepId) => {
    const requestedKey = stepKey(checkpointId, stepId);
    if (pendingMachineKey) fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
    if (preparedMachineKey && preparedMachineKey !== requestedKey)
      fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
    if (!preparedMachineKey) await drainUnboundBeforeMachineStep(checkpointId, stepId);
    preparedMachineKey = null;
    pendingMachineKey = requestedKey;
    const witness = await waitForServerTimeAfter(cursor);
    validateClockWitness(witness, cursor, 'PR_C_CH_OBSERVATION_FIXTURE_MACHINE_START');
  };

  const recordMachineStep = async ({ checkpointId, stepId, anchor, binding }) => {
    const key = stepKey(checkpointId, stepId);
    if (pendingMachineKey !== key || keys[position] !== key || records.has(key))
      fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_ORDER_REJECTED');
    if (anchor?.stepId !== stepId || binding?.stepId !== stepId || binding?.anchorToken !== anchor?.challengeToken)
      fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_BINDING_REJECTED');
    const anchorAt = timestamp(anchor.anchoredAt, 'PR_C_CH_OBSERVATION_FIXTURE_MACHINE_TIME_REJECTED');
    const bindingAt = timestamp(binding.issuedAt, 'PR_C_CH_OBSERVATION_FIXTURE_MACHINE_TIME_REJECTED');
    if (anchorAt < exerciseStarted || anchorAt <= cursor || bindingAt < anchorAt)
      fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_TIME_REJECTED');
    const witness = await waitForServerTimeAfter(Math.max(anchorAt, bindingAt));
    const completed = validateClockWitness(witness, Math.max(anchorAt, bindingAt), 'PR_C_CH_OBSERVATION_FIXTURE_MACHINE_COMPLETION');
    const record = Object.freeze({ started:anchorAt, completed, anchorAt, bindingAt, bindingToken:binding.bindingToken });
    records.set(key, record);cursor = completed;position += 1;pendingMachineKey = null;
    return record;
  };

  const captureRemaining = async () => {
    if (preparedMachineKey || pendingMachineKey) fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_OMITTED');
    while (position < normalized.length) {
      const step = normalized[position];const key = keys[position];
      if (machineStepKeys.has(key)) fail('PR_C_CH_OBSERVATION_FIXTURE_MACHINE_OMITTED');
      await captureUnbound(step);
    }
    return records;
  };

  const complete = () => {
    if (preparedMachineKey || pendingMachineKey || position !== normalized.length || records.size !== normalized.length)
      fail('PR_C_CH_OBSERVATION_FIXTURE_INCOMPLETE');
    return new Map(records);
  };

  return Object.freeze({ drainUnboundBeforeMachineStep, beforeMachineStep, recordMachineStep, captureRemaining, complete });
}
