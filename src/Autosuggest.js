import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { shallowEqualArrays } from 'shallow-equal';
import Autowhatever from './Autowhatever';
import { defaultTheme, mapToAutowhateverTheme } from './theme';

const alwaysTrue = () => true;
const defaultShouldRenderSuggestions = (value) => value.trim().length > 0;
const defaultRenderSuggestionsContainer = ({ containerProps, children }) => (
  <div {...containerProps}>{children}</div>
);

const REASON_SUGGESTIONS_REVEALED = 'suggestions-revealed';
const REASON_SUGGESTIONS_UPDATED = 'suggestions-updated';
const REASON_SUGGESTION_SELECTED = 'suggestion-selected';
const REASON_INPUT_FOCUSED = 'input-focused';
const REASON_INPUT_CHANGED = 'input-changed';
const REASON_INPUT_BLURRED = 'input-blurred';
const REASON_ESCAPE_PRESSED = 'escape-pressed';

export default class Autosuggest extends Component {
  static propTypes = {
    suggestions: PropTypes.array.isRequired,
    onSuggestionsFetchRequested: (props, propName) => {
      const onSuggestionsFetchRequested = props[propName];

      if (typeof onSuggestionsFetchRequested !== 'function') {
        throw new Error(
          "'onSuggestionsFetchRequested' must be implemented. See: https://github.com/moroshko/react-autosuggest#onSuggestionsFetchRequestedProp",
        );
      }
    },
    onSuggestionsClearRequested: (props, propName) => {
      const onSuggestionsClearRequested = props[propName];

      if (
        props.alwaysRenderSuggestions === false &&
        typeof onSuggestionsClearRequested !== 'function'
      ) {
        throw new Error(
          "'onSuggestionsClearRequested' must be implemented. See: https://github.com/moroshko/react-autosuggest#onSuggestionsClearRequestedProp",
        );
      }
    },
    shouldKeepSuggestionsOnSelect: PropTypes.func,
    onSuggestionSelected: PropTypes.func,
    onSuggestionHighlighted: PropTypes.func,
    renderInputComponent: PropTypes.func,
    renderSuggestionsContainer: PropTypes.func,
    getSuggestionValue: PropTypes.func.isRequired,
    renderSuggestion: PropTypes.func.isRequired,
    inputProps: (props, propName) => {
      const inputProps = props[propName];

      if (!inputProps) {
        throw new Error("'inputProps' must be passed.");
      }

      if (!Object.prototype.hasOwnProperty.call(inputProps, 'value')) {
        throw new Error("'inputProps' must have 'value'.");
      }

      if (!Object.prototype.hasOwnProperty.call(inputProps, 'onChange')) {
        throw new Error("'inputProps' must have 'onChange'.");
      }
    },
    shouldRenderSuggestions: PropTypes.func,
    alwaysRenderSuggestions: PropTypes.bool,
    multiSection: PropTypes.bool,
    renderSectionTitle: (props, propName) => {
      const renderSectionTitle = props[propName];

      if (
        props.multiSection === true &&
        typeof renderSectionTitle !== 'function'
      ) {
        throw new Error(
          "'renderSectionTitle' must be implemented. See: https://github.com/moroshko/react-autosuggest#renderSectionTitleProp",
        );
      }
    },
    getSectionSuggestions: (props, propName) => {
      const getSectionSuggestions = props[propName];

      if (
        props.multiSection === true &&
        typeof getSectionSuggestions !== 'function'
      ) {
        throw new Error(
          "'getSectionSuggestions' must be implemented. See: https://github.com/moroshko/react-autosuggest#getSectionSuggestionsProp",
        );
      }
    },
    focusInputOnSuggestionClick: PropTypes.bool,
    highlightFirstSuggestion: PropTypes.bool,
    theme: PropTypes.object,
    id: PropTypes.string,
    containerProps: PropTypes.object, // Arbitrary container props
  };

  static defaultProps = {
    renderSuggestionsContainer: defaultRenderSuggestionsContainer,
    shouldRenderSuggestions: defaultShouldRenderSuggestions,
    alwaysRenderSuggestions: false,
    multiSection: false,
    shouldKeepSuggestionsOnSelect: () => false,
    focusInputOnSuggestionClick: true,
    highlightFirstSuggestion: false,
    theme: defaultTheme,
    id: '1',
    containerProps: {},
  };

  constructor({ alwaysRenderSuggestions }) {
    super();

    this.state = {
      isFocused: false,
      isCollapsed: !alwaysRenderSuggestions,
      highlightedSectionIndex: null,
      highlightedSuggestionIndex: null,
      highlightedSuggestion: null,
      valueBeforeUpDown: null,
    };

    this.justPressedUpDown = false;
    this.justMouseEntered = false;

    this.pressedSuggestion = null;
  }

  componentDidMount() {
    document.addEventListener('mousedown', this.onDocumentMouseDown);
    document.addEventListener('mouseup', this.onDocumentMouseUp);

    this.input = this.autowhatever.input;
    this.suggestionsContainer = this.autowhatever.itemsContainer;
  }

  // eslint-disable-next-line camelcase, react/sort-comp
  UNSAFE_componentWillReceiveProps(nextProps) {
    // When highlightFirstSuggestion becomes deactivated, if the first suggestion was
    // set, we should reset the suggestion back to the unselected default state.
    const shouldResetHighlighting =
      this.state.highlightedSuggestionIndex === 0 &&
      this.props.highlightFirstSuggestion &&
      !nextProps.highlightFirstSuggestion;

    if (shallowEqualArrays(nextProps.suggestions, this.props.suggestions)) {
      if (
        nextProps.highlightFirstSuggestion &&
        nextProps.suggestions.length > 0 &&
        this.justPressedUpDown === false &&
        this.justMouseEntered === false
      ) {
        this.highlightFirstSuggestion();
      } else if (shouldResetHighlighting) {
        this.resetHighlightedSuggestion();
      }
    } else {
      if (this.willRenderSuggestions(nextProps, REASON_SUGGESTIONS_UPDATED)) {
        if (this.state.isCollapsed && !this.justSelectedSuggestion) {
          this.revealSuggestions();
        }

        if (shouldResetHighlighting) {
          this.resetHighlightedSuggestion();
        }
      } else {
        this.resetHighlightedSuggestion();
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { suggestions, onSuggestionHighlighted, highlightFirstSuggestion } =
      this.props;

    if (
      !shallowEqualArrays(suggestions, prevProps.suggestions) &&
      suggestions.length > 0 &&
      highlightFirstSuggestion
    ) {
      this.highlightFirstSuggestion();
      return;
    }

    if (onSuggestionHighlighted) {
      const highlightedSuggestion = this.getHighlightedSuggestion();
      const prevHighlightedSuggestion = prevState.highlightedSuggestion;

      if (highlightedSuggestion != prevHighlightedSuggestion) {
        onSuggestionHighlighted({
          suggestion: highlightedSuggestion,
        });
      }
    }
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.onDocumentMouseDown);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
  }

  updateHighlightedSuggestion(sectionIndex, suggestionIndex, prevValue) {
    this.setState((state) => {
      let { valueBeforeUpDown } = state;

      if (suggestionIndex === null) {
        valueBeforeUpDown = null;
      } else if (
        valueBeforeUpDown === null &&
        typeof prevValue !== 'undefined'
      ) {
        valueBeforeUpDown = prevValue;
      }

      return {
        highlightedSectionIndex: sectionIndex,
        highlightedSuggestionIndex: suggestionIndex,
        highlightedSuggestion:
          suggestionIndex === null
            ? null
            : this.getSuggestion(sectionIndex, suggestionIndex),
        valueBeforeUpDown,
      };
    });
  }

  resetHighlightedSuggestion(shouldResetValueBeforeUpDown = true) {
    this.setState((state) => {
      const { valueBeforeUpDown } = state;

      return {
        highlightedSectionIndex: null,
        highlightedSuggestionIndex: null,
        highlightedSuggestion: null,
        valueBeforeUpDown: shouldResetValueBeforeUpDown
          ? null
          : valueBeforeUpDown,
      };
    });
  }

  revealSuggestions() {
    this.setState({
      isCollapsed: false,
    });
  }

  closeSuggestions() {
    this.setState({
      highlightedSectionIndex: null,
      highlightedSuggestionIndex: null,
      highlightedSuggestion: null,
      valueBeforeUpDown: null,
      isCollapsed: true,
    });
  }

  getSuggestion(sectionIndex, suggestionIndex) {
    const { suggestions, multiSection, getSectionSuggestions } = this.props;

    if (multiSection) {
      return getSectionSuggestions(suggestions[sectionIndex])[suggestionIndex];
    }

    return suggestions[suggestionIndex];
  }

  getHighlightedSuggestion() {
    const { highlightedSectionIndex, highlightedSuggestionIndex } = this.state;

    if (highlightedSuggestionIndex === null) {
      return null;
    }

    return this.getSuggestion(
      highlightedSectionIndex,
      highlightedSuggestionIndex,
    );
  }

  getSuggestionValueByIndex(sectionIndex, suggestionIndex) {
    const { getSuggestionValue } = this.props;

    return getSuggestionValue(
      this.getSuggestion(sectionIndex, suggestionIndex),
    );
  }

  getSuggestionIndices(suggestionElement) {
    const sectionIndex = suggestionElement.getAttribute('data-section-index');
    const suggestionIndex = suggestionElement.getAttribute(
      'data-suggestion-index',
    );

    return {
      sectionIndex:
        typeof sectionIndex === 'string' ? parseInt(sectionIndex, 10) : null,
      suggestionIndex: parseInt(suggestionIndex, 10),
    };
  }

  onDocumentMouseDown = (event) => {
    this.justClickedOnSuggestionsContainer = false;

    let node =
      (event.detail && event.detail.target) || // This is for testing only. Please show me a better way to emulate this.
      event.target;

    while (node !== null && node !== document) {
      if (
        node.getAttribute &&
        node.getAttribute('data-suggestion-index') !== null
      ) {
        // Suggestion was clicked
        return;
      }

      if (node === this.suggestionsContainer) {
        // Something else inside suggestions container was clicked
        this.justClickedOnSuggestionsContainer = true;
        return;
      }

      node = node.parentNode;
    }
  };

  findSuggestionElement(startNode) {
    let node = startNode;

    do {
      if (
        node.getAttribute &&
        node.getAttribute('data-suggestion-index') !== null
      ) {
        return node;
      }

      node = node.parentNode;
    } while (node !== null);

    console.error('Clicked element:', startNode); // eslint-disable-line no-console
    throw new Error("Couldn't find suggestion element");
  }

  maybeCallOnChange(event, newValue, method) {
    const { value, onChange } = this.props.inputProps;

    if (newValue !== value) {
      onChange(event, { newValue, method });
    }
  }

  willRenderSuggestions(props, reason) {
    const { suggestions, inputProps, shouldRenderSuggestions } = props;
    const { value } = inputProps;

    return suggestions.length > 0 && shouldRenderSuggestions(value, reason);
  }

  storeAutowhateverRef = (autowhatever) => {
    if (autowhatever !== null) {
      this.autowhatever = autowhatever;
    }
  };

  onSuggestionMouseEnter = (event, { sectionIndex, itemIndex }) => {
    this.updateHighlightedSuggestion(sectionIndex, itemIndex);

    if (event.target === this.pressedSuggestion) {
      this.justSelectedSuggestion = true;
    }

    this.justMouseEntered = true;

    setTimeout(() => {
      this.justMouseEntered = false;
    });
  };

  highlightFirstSuggestion = () => {
    this.updateHighlightedSuggestion(this.props.multiSection ? 0 : null, 0);
  };

  onDocumentMouseUp = () => {
    if (this.pressedSuggestion && !this.justSelectedSuggestion) {
      this.input.focus();
    }
    this.pressedSuggestion = null;
  };

  onSuggestionMouseDown = (event) => {
    // Checking if this.justSelectedSuggestion is already true to not duplicate touch events in chrome
    // See: https://github.com/facebook/react/issues/9809#issuecomment-413978405
    if (!this.justSelectedSuggestion) {
      this.justSelectedSuggestion = true;
      this.pressedSuggestion = event.target;
    }
  };

  onSuggestionsClearRequested = () => {
    const { onSuggestionsClearRequested } = this.props;

    onSuggestionsClearRequested && onSuggestionsClearRequested();
  };

  onSuggestionSelected = (event, data) => {
    const {
      alwaysRenderSuggestions,
      onSuggestionSelected,
      onSuggestionsFetchRequested,
    } = this.props;

    onSuggestionSelected && onSuggestionSelected(event, data);

    const keepSuggestionsOnSelect = this.props.shouldKeepSuggestionsOnSelect(
      data.suggestion,
    );

    if (alwaysRenderSuggestions || keepSuggestionsOnSelect) {
      onSuggestionsFetchRequested({
        value: data.suggestionValue,
        reason: REASON_SUGGESTION_SELECTED,
      });
    } else {
      this.onSuggestionsClearRequested();
    }

    this.resetHighlightedSuggestion();
  };

  onSuggestionClick = (event) => {
    const { alwaysRenderSuggestions, focusInputOnSuggestionClick } = this.props;
    const { sectionIndex, suggestionIndex } = this.getSuggestionIndices(
      this.findSuggestionElement(event.target),
    );
    const clickedSuggestion = this.getSuggestion(sectionIndex, suggestionIndex);
    const clickedSuggestionValue =
      this.props.getSuggestionValue(clickedSuggestion);

    this.maybeCallOnChange(event, clickedSuggestionValue, 'click');
    this.onSuggestionSelected(event, {
      suggestion: clickedSuggestion,
      suggestionValue: clickedSuggestionValue,
      suggestionIndex: suggestionIndex,
      sectionIndex,
      method: 'click',
    });

    const keepSuggestionsOnSelect =
      this.props.shouldKeepSuggestionsOnSelect(clickedSuggestion);

    if (!(alwaysRenderSuggestions || keepSuggestionsOnSelect)) {
      this.closeSuggestions();
    }

    if (focusInputOnSuggestionClick === true) {
      this.input.focus();
    } else {
      this.onBlur();
    }

    setTimeout(() => {
      this.justSelectedSuggestion = false;
    });
  };

  onBlur = () => {
    const { inputProps, shouldRenderSuggestions } = this.props;
    const { value, onBlur } = inputProps;
    const highlightedSuggestion = this.getHighlightedSuggestion();
    const shouldRender = shouldRenderSuggestions(value, REASON_INPUT_BLURRED);

    this.setState({
      isFocused: false,
      highlightedSectionIndex: null,
      highlightedSuggestionIndex: null,
      highlightedSuggestion: null,
      valueBeforeUpDown: null,
      isCollapsed: !shouldRender,
    });

    onBlur && onBlur(this.blurEvent, { highlightedSuggestion });
  };

  onSuggestionMouseLeave = (event) => {
    this.resetHighlightedSuggestion(false); // shouldResetValueBeforeUpDown

    if (
      this.justSelectedSuggestion &&
      event.target === this.pressedSuggestion
    ) {
      this.justSelectedSuggestion = false;
    }
  };

  onSuggestionTouchStart = () => {
    this.justSelectedSuggestion = true;
    // todo: event.preventDefault when https://github.com/facebook/react/issues/2043
    // todo: gets released so onSuggestionMouseDown won't fire in chrome
  };

  onSuggestionTouchMove = () => {
    this.justSelectedSuggestion = false;
    this.pressedSuggestion = null;
    this.input.focus();
  };

  itemProps = ({ sectionIndex, itemIndex }) => {
    return {
      'data-section-index': sectionIndex,
      'data-suggestion-index': itemIndex,
      onMouseEnter: this.onSuggestionMouseEnter,
      onMouseLeave: this.onSuggestionMouseLeave,
      onMouseDown: this.onSuggestionMouseDown,
      onTouchStart: this.onSuggestionTouchStart,
      onTouchMove: this.onSuggestionTouchMove,
      onClick: this.onSuggestionClick,
    };
  };

  getQuery() {
    const { inputProps } = this.props;
    const { value } = inputProps;
    const { valueBeforeUpDown } = this.state;

    return (valueBeforeUpDown === null ? value : valueBeforeUpDown).trim();
  }

  renderSuggestionsContainer = ({ containerProps, children }) => {
    const { renderSuggestionsContainer } = this.props;

    return renderSuggestionsContainer({
      containerProps,
      children,
      query: this.getQuery(),
    });
  };

  render() {
    const {
      suggestions,
      renderInputComponent,
      onSuggestionsFetchRequested,
      renderSuggestion,
      inputProps,
      multiSection,
      renderSectionTitle,
      id,
      getSectionSuggestions,
      theme,
      getSuggestionValue,
      alwaysRenderSuggestions,
      highlightFirstSuggestion,
      containerProps,
    } = this.props;
    const {
      isFocused,
      isCollapsed,
      highlightedSectionIndex,
      highlightedSuggestionIndex,
      valueBeforeUpDown,
    } = this.state;
    const shouldRenderSuggestions = alwaysRenderSuggestions
      ? alwaysTrue
      : this.props.shouldRenderSuggestions;
    const { value, onFocus, onKeyDown } = inputProps;
    const willRenderSuggestions = this.willRenderSuggestions(
      this.props,
      'render',
    );
    const isOpen =
      alwaysRenderSuggestions ||
      (isFocused && !isCollapsed && willRenderSuggestions);
    const items = isOpen ? suggestions : [];
    const autowhateverInputProps = {
      ...inputProps,
      onFocus: (event) => {
        if (
          !this.justSelectedSuggestion &&
          !this.justClickedOnSuggestionsContainer
        ) {
          const shouldRender = shouldRenderSuggestions(
            value,
            REASON_INPUT_FOCUSED,
          );

          this.setState({
            isFocused: true,
            isCollapsed: !shouldRender,
          });

          onFocus && onFocus(event);

          if (shouldRender) {
            onSuggestionsFetchRequested({
              value,
              reason: REASON_INPUT_FOCUSED,
            });
          }
        }
      },
      onBlur: (event) => {
        if (this.justClickedOnSuggestionsContainer) {
          this.input.focus();
          return;
        }

        this.blurEvent = event;

        if (!this.justSelectedSuggestion) {
          this.onBlur();
          this.onSuggestionsClearRequested();
        }
      },
      onChange: (event) => {
        const { value } = event.target;
        const shouldRender = shouldRenderSuggestions(
          value,
          REASON_INPUT_CHANGED,
        );

        this.maybeCallOnChange(event, value, 'type');

        if (this.suggestionsContainer) {
          this.suggestionsContainer.scrollTop = 0;
        }

        this.setState({
          ...(highlightFirstSuggestion
            ? {}
            : {
                highlightedSectionIndex: null,
                highlightedSuggestionIndex: null,
                highlightedSuggestion: null,
              }),
          valueBeforeUpDown: null,
          isCollapsed: !shouldRender,
        });

        if (shouldRender) {
          onSuggestionsFetchRequested({ value, reason: REASON_INPUT_CHANGED });
        } else {
          this.onSuggestionsClearRequested();
        }
      },
      onKeyDown: (event, data) => {
        const { keyCode } = event;

        switch (keyCode) {
          case 40: // ArrowDown
          case 38: // ArrowUp
            if (isCollapsed) {
              if (shouldRenderSuggestions(value, REASON_SUGGESTIONS_REVEALED)) {
                onSuggestionsFetchRequested({
                  value,
                  reason: REASON_SUGGESTIONS_REVEALED,
                });
                this.revealSuggestions();
                event.preventDefault(); // We act on the key.
              }
            } else if (suggestions.length > 0) {
              const { newHighlightedSectionIndex, newHighlightedItemIndex } =
                data;

              let newValue;

              if (newHighlightedItemIndex === null) {
                // valueBeforeUpDown can be null if, for example, user
                // hovers on the first suggestion and then pressed Up.
                // If that happens, use the original input value.
                newValue =
                  valueBeforeUpDown === null ? value : valueBeforeUpDown;
              } else {
                newValue = this.getSuggestionValueByIndex(
                  newHighlightedSectionIndex,
                  newHighlightedItemIndex,
                );
              }

              this.updateHighlightedSuggestion(
                newHighlightedSectionIndex,
                newHighlightedItemIndex,
                value,
              );
              this.maybeCallOnChange(
                event,
                newValue,
                keyCode === 40 ? 'down' : 'up',
              );
              event.preventDefault(); // We act on the key.
            }

            this.justPressedUpDown = true;

            setTimeout(() => {
              this.justPressedUpDown = false;
            });

            break;

          // Enter
          case 13: {
            // See #388
            if (event.keyCode === 229) {
              break;
            }

            const highlightedSuggestion = this.getHighlightedSuggestion();

            if (isOpen && !alwaysRenderSuggestions) {
              this.closeSuggestions();
            }

            if (highlightedSuggestion != null) {
              event.preventDefault();
              const newValue = getSuggestionValue(highlightedSuggestion);

              this.maybeCallOnChange(event, newValue, 'enter');

              this.onSuggestionSelected(event, {
                suggestion: highlightedSuggestion,
                suggestionValue: newValue,
                suggestionIndex: highlightedSuggestionIndex,
                sectionIndex: highlightedSectionIndex,
                method: 'enter',
              });

              this.justSelectedSuggestion = true;

              setTimeout(() => {
                this.justSelectedSuggestion = false;
              });
            }

            break;
          }

          // Escape
          case 27: {
            if (isOpen) {
              // If input.type === 'search', the browser clears the input
              // when Escape is pressed. We want to disable this default
              // behaviour so that, when suggestions are shown, we just hide
              // them, without clearing the input.
              event.preventDefault();
            }

            const willCloseSuggestions = isOpen && !alwaysRenderSuggestions;

            if (valueBeforeUpDown === null) {
              // Didn't interact with Up/Down
              if (!willCloseSuggestions) {
                const newValue = '';

                this.maybeCallOnChange(event, newValue, 'escape');

                if (shouldRenderSuggestions(newValue, REASON_ESCAPE_PRESSED)) {
                  onSuggestionsFetchRequested({
                    value: newValue,
                    reason: REASON_ESCAPE_PRESSED,
                  });
                } else {
                  this.onSuggestionsClearRequested();
                }
              }
            } else {
              // Interacted with Up/Down
              this.maybeCallOnChange(event, valueBeforeUpDown, 'escape');
            }

            if (willCloseSuggestions) {
              this.onSuggestionsClearRequested();
              this.closeSuggestions();
            } else {
              this.resetHighlightedSuggestion();
            }

            break;
          }
        }

        onKeyDown && onKeyDown(event);
      },
    };
    const renderSuggestionData = {
      query: this.getQuery(),
    };

    return (
      <Autowhatever
        multiSection={multiSection}
        items={items}
        renderInputComponent={renderInputComponent}
        renderItemsContainer={this.renderSuggestionsContainer}
        renderItem={renderSuggestion}
        renderItemData={renderSuggestionData}
        renderSectionTitle={renderSectionTitle}
        getSectionItems={getSectionSuggestions}
        highlightedSectionIndex={highlightedSectionIndex}
        highlightedItemIndex={highlightedSuggestionIndex}
        containerProps={containerProps}
        inputProps={autowhateverInputProps}
        itemProps={this.itemProps}
        theme={mapToAutowhateverTheme(theme)}
        id={id}
        ref={this.storeAutowhateverRef}
      />
    );
  }
}
