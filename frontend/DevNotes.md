# Development Notes

1. **Framework or Vanilla JS**:
    - Frameworks like React, Vue, and Angular help manage state, DOM updates, and component reusability for medium to large apps.
    - Vanilla JS works best for **small, static apps** or when learning core web fundamentals.

    **Comparisons**:
    1. Vanilla JS (Plain HTML + JS)
    Vanilla JS is just **HTML, CSS, and JS without extra libraries**.
        - **Pros**: 
          - Lightweight, no dependencies  
          - Total control  
          - Teaches core web fundamentals  

        - **Cons**: 
          - Hard to scale  
          - Repetitive code  
          - Less productive for dynamic apps  

        - **Use case**: Small apps, prototypes, learning fundamentals  

    2. React
    React is a **library for building component-based UIs** using JSX.

        - **Pros**: 
          - Reusable components  
          - Virtual DOM for efficient UI updates  
          - Huge ecosystem  
          - Widely adopted  

        - **Cons**: 
          - Learning curve for JSX, hooks, state  
          - Needs additional libraries for routing/state  
          - Requires build tools  

        - **Use case**: Single-page applications (SPAs), medium to large dynamic apps  

    3. Vue
    Vue is a **progressive framework** with reactive data binding and template-based UI.

        - **Pros**: 
          - Easy to learn  
          - Reactive and flexible  
          - Lightweight  

        - **Cons**: 
          - Smaller ecosystem than React  
          - Less corporate adoption  
         - Can be overkill for very simple apps  

        - **Use case**: Medium-sized apps or teams wanting easy-to-learn reactive frameworks  

    4. Angular
    Angular is a **full-featured framework** with built-in routing, state management, HTTP handling, and TypeScript support.

        - **Pros**: 
          - Complete solution out-of-the-box  
          - Strong TypeScript integration  
          - Enterprise-ready  
          - Powerful CLI tooling  

        - **Cons**: 
          - Steep learning curve  
          - Verbose  
          - Larger bundle sizes  

        - **Use case**: Large-scale enterprise applications  

    5. Bootstrap
    Bootstrap is a **CSS/JS framework for styling and UI components**.

        - **Purpose**: Handles layout, design, and pre-styled UI components  
        - **Does it replace frameworks?** ❌ No. It complements them. Frameworks handle logic; Bootstrap handles style  
        - **Integration**: Works with Vanilla JS, React, Vue, Angular (via libraries like BootstrapVue/ng-bootstrap)  
        - **Analogy**: Framework = car engine; Bootstrap = paint, seats, and dashboard

    I choose a frontend framework or Vanilla JS based on **app complexity, scalability, and team familiarity**. 