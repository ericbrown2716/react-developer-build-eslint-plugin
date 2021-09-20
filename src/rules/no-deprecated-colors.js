const deprecations = require('@primer/primitives/dist/deprecations/colors')

const styledSystemColorProps = ['color', 'bg', 'backgroundColor', 'borderColor', 'textShadow', 'boxShadow']

module.exports = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          skipImportCheck: {
            type: 'boolean'
          }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    // If `skipImportCheck` is true, this rule will check for deprecated colors
    // used in any components (not just ones that are imported from `@primer/components`).
    const skipImportCheck = context.options[0] ? context.options[0].skipImportCheck : false

    return {
      JSXOpeningElement(node) {
        // Skip if component was not imported from @primer/components
        if (!skipImportCheck && !isPrimerComponent(node.name, context.getScope(node))) {
          return
        }

        for (const attribute of node.attributes) {
          if (!attribute.name || !attribute.value) {
            continue
          }

          const propName = attribute.name.name
          const propValue = attribute.value.value

          // Check for the sx prop
          if (propName === 'sx' && attribute.value.expression.type === 'ObjectExpression') {
            // Ignore non-literal properties
            const sxProperties = attribute.value.expression.properties.filter(
              property => property.type === 'Property' && property.value.type === 'Literal'
            )

            for (const prop of sxProperties) {
              const propName = prop.key.name
              const propValue = prop.value.value

              if (styledSystemColorProps.includes(propName) && Object.keys(deprecations).includes(propValue)) {
                replaceDeprecatedColor(context, prop.value, propValue)
              }
            }
          }

          // Check if styled-system color prop is using a deprecated color
          if (styledSystemColorProps.includes(propName) && Object.keys(deprecations).includes(propValue)) {
            replaceDeprecatedColor(context, attribute.value, propValue)
          }
        }
      },
      CallExpression(node) {
        // Skip if not calling the `themeGet` or `get` function
        // `get` is the internal version of `themeGet` that's used in the primer/react repository
        if (
          !isThemeGet(node.callee, context.getScope(node), skipImportCheck) &&
          !isGet(node.callee, context.getScope(node))
        ) {
          return
        }

        const [key, ...path] = node.arguments[0].value.split('.')
        const name = path.join('.')

        if (['colors', 'shadows'].includes(key) && Object.keys(deprecations).includes(name)) {
          replaceDeprecatedColor(context, node.arguments[0], name, str => [key, str].join('.'))
        }
      }
    }
  }
}

/**
 * Get the variable declaration for the given identifier
 */
function getVariableDeclaration(scope, identifier) {
  if (scope === null) {
    return null
  }

  for (const variable of scope.variables) {
    if (variable.name === identifier.name) {
      return variable.defs[0]
    }
  }

  return getVariableDeclaration(scope.upper, identifier)
}

/**
 * Check if the given identifier is imported from the given module
 */
function isImportedFrom(moduleRegex, identifier, scope) {
  const definition = getVariableDeclaration(scope, identifier)

  // Return true if the variable was imported from the given module
  return definition && definition.type == 'ImportBinding' && moduleRegex.test(definition.parent.source.value)
}

function isPrimerComponent(identifier, scope) {
  return isImportedFrom(/^@primer\/components/, identifier, scope)
}

function isThemeGet(identifier, scope, skipImportCheck = false) {
  if (!skipImportCheck) {
    return isImportedFrom(/^@primer\/components/, identifier, scope) && identifier.name === 'themeGet'
  }

  return identifier.name === 'themeGet'
}

// `get` is the internal version of `themeGet` that's used in the primer/react repository.
function isGet(identifier, scope) {
  // This is a flaky way to check for the `get` function and should probably be improved.
  return isImportedFrom(/^\.\.?\/constants$/, identifier, scope) && identifier.name === 'get'
}

function replaceDeprecatedColor(context, node, deprecatedName, getDisplayName = str => str) {
  const replacement = deprecations[deprecatedName]

  if (replacement === null) {
    // No replacement
    context.report({
      node,
      message: `"${getDisplayName(
        deprecatedName
      )}" is deprecated. Go to https://primer.style/primitives or reach out in the #primer channel on Slack to find a suitable replacement.`
    })
  } else if (Array.isArray(replacement)) {
    // Multiple possible replacements
    context.report({
      node,
      message: `"${getDisplayName(deprecatedName)}" is deprecated.`,
      suggest: replacement.map(replacementValue => ({
        desc: `Use "${getDisplayName(replacementValue)}" instead.`,
        fix(fixer) {
          return fixer.replaceText(node, JSON.stringify(getDisplayName(replacementValue)))
        }
      }))
    })
  } else {
    // One replacement
    context.report({
      node,
      message: `"${getDisplayName(deprecatedName)}" is deprecated. Use "${getDisplayName(replacement)}" instead.`,
      fix(fixer) {
        return fixer.replaceText(node, JSON.stringify(getDisplayName(replacement)))
      }
    })
  }
}
