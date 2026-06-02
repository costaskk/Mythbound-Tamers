// Add the import using your real package:
import com.yourpackage.mythbound.MythboundUpdaterPlugin;

// Inside MainActivity class, add this onCreate if you do not already have one:
@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MythboundUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
}
